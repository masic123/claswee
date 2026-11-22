const cloud = require('wx-server-sdk');
const crypto = require('crypto');
const cloudbase = require('@cloudbase/node-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const app = cloudbase.init({ env: process.env.TCB_ENV || cloudbase.SYMBOL_CURRENT_ENV });
const pgDb = app.rdb({ database: 'public' });
if (process.env.CLASWEE_DB_KEY) pgDb.headers.set('X-Claswee-Service-Key', process.env.CLASWEE_DB_KEY);
const CHUNK_TABLE = 'claswee_image_import_chunks';
const OCR_TABLE = 'claswee_image_import_ocr';
const LIMIT_COLLECTION = 'claswee_image_import_limits';
const DAILY_LIMIT = 10;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_COURSES = 40;
const memoryQuota = new Map();

function fail(code, message) { return { ok: false, code, message }; }
function hash(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
function isHttp(event) { return !!(event && (event.httpMethod || event.headers && event.headers.origin)); }
function reply(event, payload, statusCode) {
  if (!isHttp(event)) return payload;
  return {
    statusCode: statusCode || (payload.ok ? 200 : 400),
    headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': process.env.WEB_ORIGIN || '*', 'access-control-allow-headers': 'content-type,x-claswee-client', 'access-control-allow-methods': 'POST,OPTIONS' },
    body: JSON.stringify(payload)
  };
}
function payloadOf(event) {
  if (!event) return {};
  if (typeof event.body === 'string') {
    try { return JSON.parse(event.body); } catch (_) { return {}; }
  }
  return event.body && typeof event.body === 'object' ? event.body : event;
}
function dataUrl(value) {
  const text = String(value || '');
  if (!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(text)) throw Object.assign(new Error('请上传 JPG、PNG 或 WEBP 图片'), { code: 'INVALID_IMAGE' });
  const raw = text.slice(text.indexOf(',') + 1);
  if (!raw || Buffer.byteLength(raw, 'base64') > MAX_IMAGE_BYTES) throw Object.assign(new Error('图片压缩后不能超过 3MB'), { code: 'IMAGE_TOO_LARGE' });
  const bytes = Buffer.from(raw, 'base64');
  const valid = /^[A-Za-z0-9+/]+={0,2}$/.test(raw) && (
    /^data:image\/png;/i.test(text) && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ||
    /^data:image\/jpe?g;/i.test(text) && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ||
    /^data:image\/webp;/i.test(text) && bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP');
  if (!valid) throw Object.assign(new Error('图片内容与格式不符，请重新选择'), { code: 'INVALID_IMAGE' });
  return text;
}
function dbData(result) {
  if (result && result.error) {
    console.error('image import database failed', { code: result.error.code, message: result.error.message });
    throw Object.assign(new Error('临时图片存储失败，请重试'), { code: 'IMAGE_STORE_FAILED' });
  }
  return result && result.data || [];
}
function uploadIdOf(input) {
  const id = String(input.uploadId || '');
  if (!/^[a-z0-9_-]{16,64}$/i.test(id)) throw Object.assign(new Error('图片上传标识无效'), { code: 'INVALID_UPLOAD' });
  return id;
}
async function clearChunks(id, clientHash) {
  dbData(await pgDb.from(CHUNK_TABLE).delete().eq('upload_id', id).eq('client_hash', clientHash));
  dbData(await pgDb.from(OCR_TABLE).delete().eq('upload_id', id).eq('client_hash', clientHash));
}
async function uploadChunk(input, clientHash) {
  const id = uploadIdOf(input), index = input.partIndex, count = input.partCount, mime = input.mime;
  const content = String(input.content || '');
  if (!Number.isInteger(index) || !Number.isInteger(count) || index < 0 || count < 1 || count > 72 || index >= count || !['jpeg','png','webp'].includes(mime) || !content || content.length > 80000 || !/^[A-Za-z0-9+/=]+$/.test(content)) throw Object.assign(new Error('图片分片格式无效'), { code: 'INVALID_UPLOAD' });
  if (index === 0) {
    await useQuota(clientHash);
    dbData(await pgDb.from(CHUNK_TABLE).delete().lt('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString()));
  } else {
    const existing = dbData(await pgDb.from(CHUNK_TABLE).select('part_count,mime').eq('upload_id', id).eq('client_hash', clientHash).eq('part_index', 0).limit(1));
    if (!existing.length || existing[0].part_count !== count || existing[0].mime !== mime) throw Object.assign(new Error('图片上传已失效，请重新识别'), { code: 'UPLOAD_EXPIRED' });
  }
  dbData(await pgDb.from(CHUNK_TABLE).upsert({ upload_id: id, client_hash: clientHash, part_index: index, part_count: count, mime, content }, { onConflict: 'upload_id,part_index' }));
  return { uploaded: index + 1, total: count };
}
async function assembledImage(input, clientHash) {
  const id = uploadIdOf(input);
  const rows = dbData(await pgDb.from(CHUNK_TABLE).select('part_index,part_count,mime,content').eq('upload_id', id).eq('client_hash', clientHash).order('part_index', { ascending: true }));
  if (!rows.length || rows.length !== rows[0].part_count || rows.some((row, index) => row.part_index !== index || row.part_count !== rows.length || row.mime !== rows[0].mime)) throw Object.assign(new Error('图片上传不完整，请重新识别'), { code: 'UPLOAD_INCOMPLETE' });
  return dataUrl(`data:image/${rows[0].mime};base64,${rows.map(row => row.content).join('')}`);
}
function numberIn(value, min, max, fallback) {
  if (typeof value !== 'number' && typeof value !== 'string' || typeof value === 'string' && !value.trim()) return fallback;
  const result = Number(value);
  return Number.isInteger(result) && result >= min && result <= max ? result : fallback;
}
function sectionSuggestion(hint, sections, breaks) {
  const match = /^(morning|afternoon|evening)_(first|second|all)$/.exec(String(hint || ''));
  if (!match || !Array.isArray(sections)) return null;
  const groups = { morning: [], afternoon: [], evening: [] };
  if (breaks && Number.isInteger(breaks.lunchAfter) && Number.isInteger(breaks.dinnerAfter) && breaks.lunchAfter >= 1 && breaks.lunchAfter < breaks.dinnerAfter && breaks.dinnerAfter <= sections.length) {
    for (let index = 0; index < sections.length; index++) {
      const section = index + 1;
      groups[section <= breaks.lunchAfter ? 'morning' : section <= breaks.dinnerAfter ? 'afternoon' : 'evening'].push(section);
    }
  } else {
    for (let index = 0; index < sections.length; index++) {
      const time = /^(\d{1,2}):(\d{2})$/.exec(String(sections[index] && sections[index].s || ''));
      if (!time) return null;
      const minutes = Number(time[1]) * 60 + Number(time[2]);
      const period = minutes < 12 * 60 + 30 ? 'morning' : minutes < 18 * 60 ? 'afternoon' : 'evening';
      groups[period].push(index + 1);
    }
  }
  const group = groups[match[1]];
  if (group.length < 2 || group.length % 2 || group.some((section, index) => section !== group[0] + index)) return null;
  const middle = group.length / 2;
  const pair = match[2] === 'first' ? group.slice(0, middle) : match[2] === 'second' ? group.slice(middle) : group;
  return { suggestedS1: pair[0], suggestedS2: pair[pair.length - 1] };
}
function weekday(text) {
  const value = String(text || '').replace(/\s/g, '').toLowerCase();
  const chinese = /(?:星期|礼拜|周)([一二三四五六日天1-7])/.exec(value);
  if (chinese) return ({ 一:1, 二:2, 三:3, 四:4, 五:5, 六:6, 日:7, 天:7 })[chinese[1]] || Number(chinese[1]);
  const english = /^(mon|tue|wed|thu|fri|sat|sun)/.exec(value);
  return english ? ['mon','tue','wed','thu','fri','sat','sun'].indexOf(english[1]) + 1 : null;
}
function ocrHeaders(ocr, today = new Date()) {
  if (!ocr || !Array.isArray(ocr.lines)) return [];
  const lines = ocr.lines.filter(line => Array.isArray(line.box) && Number(line.score) >= 0.55);
  const explicit = lines.map(line => ({ day: weekday(line.text), x: (line.box[0] + line.box[2]) / 2, y: (line.box[1] + line.box[3]) / 2 })).filter(item => item.day);
  const grouped = explicit.filter(item => Math.abs(item.y - Math.min(...explicit.map(header => header.y))) < 80).sort((a,b) => a.x-b.x);
  if (grouped.length >= 3 && grouped.every((item,index) => index === 0 || item.x > grouped[index-1].x + 15)) return grouped;
  const dates = lines.map(line => {
    const match = /^\s*(\d{1,2})\s*[\/-]\s*(\d{1,2})\s*$/.exec(line.text);
    if (!match || Number(match[1]) < 1 || Number(match[1]) > 12 || Number(match[2]) < 1 || Number(match[2]) > 31) return null;
    return { month:Number(match[1]), date:Number(match[2]), x:(line.box[0]+line.box[2])/2, y:(line.box[1]+line.box[3])/2 };
  }).filter(Boolean);
  if (dates.length) {
    const headingY = Math.min(...dates.map(item => item.y));
    dates.splice(0, dates.length, ...dates.filter(item => Math.abs(item.y-headingY) < 80));
  }
  dates.sort((a,b) => a.x-b.x);
  if (dates.length !== 7 || Math.max(...dates.map(item => item.y))-Math.min(...dates.map(item => item.y)) > 80) return [];
  const years = [today.getUTCFullYear()-1, today.getUTCFullYear(), today.getUTCFullYear()+1];
  const candidates = years.map(year => {
    const first = new Date(Date.UTC(year, dates[0].month-1, dates[0].date));
    if (first.getUTCMonth() !== dates[0].month-1 || first.getUTCDate() !== dates[0].date) return null;
    const valid = dates.every((item,index) => {
      const next = new Date(first.getTime() + index * 86400000);
      return next.getUTCMonth() === item.month-1 && next.getUTCDate() === item.date;
    });
    return valid ? { first, distance:Math.abs(first.getTime()-today.getTime()) } : null;
  }).filter(Boolean).sort((a,b) => a.distance-b.distance);
  if (!candidates.length || candidates[0].distance > 120 * 86400000) return [];
  const firstDay = candidates[0].first.getUTCDay() || 7;
  return dates.map((item,index) => ({ ...item, day:(firstDay+index-1)%7+1 }));
}
function ocrDayForLine(id, ocr, headers, courseName) {
  const line = ocr.lines.find(item => item.id === id && Number(item.score) >= 0.6);
  if (!line || !headers.length || line.box[1] <= Math.max(...headers.map(item => item.y)) + 10) return null;
  const clean = text => String(text || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const name = clean(courseName), anchor = clean(line.text);
  if (name.length < 2 || anchor.length < 2 || !(name.includes(anchor) || anchor.includes(name))) return null;
  const x = (line.box[0]+line.box[2])/2;
  let nearest = headers[0], distance = Math.abs(x-nearest.x);
  for (const header of headers.slice(1)) {
    const next = Math.abs(x-header.x);
    if (next < distance) { nearest = header; distance = next; }
  }
  const spacing = headers.length > 1 ? Math.min(...headers.slice(1).map((item,index) => item.x-headers[index].x)) : 0;
  return spacing > 0 && distance <= spacing * 0.58 ? nearest.day : null;
}
function reconcileDays(raw, ocr) {
  const headers = ocrHeaders(ocr);
  if (!headers.length) return raw;
  for (const course of raw.courses || []) for (const slot of course.slots || []) {
    const ids = Array.isArray(slot.sourceIds) ? slot.sourceIds.slice(0, 6) : [];
    const votes = ids.map(id => ocrDayForLine(String(id), ocr, headers, course.name)).filter(Boolean);
    const day = votes.length && votes.every(value => value === votes[0]) ? votes[0] : null;
    if (day) { slot.day = day; slot.daySource = 'ocr'; }
    else slot.dayUncertain = true;
  }
  return raw;
}
function sanitizeOcr(value) {
  if (!value || typeof value !== 'object') throw new Error('OCR response is empty');
  const width = numberIn(value.width, 1, 10000, null), height = numberIn(value.height, 1, 10000, null);
  if (!width || !height) throw new Error('OCR image dimensions are invalid');
  const lines = (Array.isArray(value.lines) ? value.lines : []).slice(0, 500).map((line,index) => ({
    id: `t${index+1}`, text: String(line.text || '').slice(0, 100), score: Math.max(0, Math.min(1, Number(line.score) || 0)),
    box: Array.isArray(line.box) && line.box.length === 4 ? line.box.map(Number) : []
  })).filter(line => line.text && line.box.length === 4 && line.box.every(Number.isFinite));
  const crops = (Array.isArray(value.crops) ? value.crops : []).slice(0, 4).map(item => ({ top:Number(item.top), bottom:Number(item.bottom), image:String(item.image || '') })).filter(item => Number.isFinite(item.top) && Number.isFinite(item.bottom) && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(item.image) && item.image.length < 1500000);
  if (JSON.stringify(crops).length > 4500000) throw new Error('OCR crops are too large');
  return { width, height, lines, crops };
}
async function prepareOcr(input, clientHash) {
  const image = await assembledImage(input, clientHash), id = uploadIdOf(input);
  let ocr = null;
  try {
    const response = await app.callFunction({ name:'scheduleOcr', data:{ image, token:process.env.SCHEDULE_OCR_SERVICE_KEY } }, { timeout:45000 });
    ocr = sanitizeOcr(response && response.result);
  } catch (error) {
    console.warn('schedule OCR unavailable', { code:String(error && error.code || 'OCR_FAILED') });
  }
  dbData(await pgDb.from(OCR_TABLE).upsert({ upload_id:id, client_hash:clientHash, result:ocr || {}, created_at:new Date().toISOString() }, { onConflict:'upload_id' }));
  return { ocrReady:!!ocr, message:ocr ? '文字位置已提取，正在识别课程…' : 'OCR 暂不可用，继续使用图片识别；请仔细核对星期' };
}
async function preparedOcr(input, clientHash) {
  const rows = dbData(await pgDb.from(OCR_TABLE).select('result').eq('upload_id', uploadIdOf(input)).eq('client_hash', clientHash).limit(1));
  return rows.length && rows[0].result && rows[0].result.width ? sanitizeOcr(rows[0].result) : null;
}
function normalizeCourse(raw, context) {
  if (!raw || typeof raw !== 'object') return null;
  const name = String(raw.name || '').trim().slice(0, 40);
  if (!name) return null;
  const slots = (Array.isArray(raw.slots) ? raw.slots : []).map(slot => {
    if (!slot) return null;
    const day = numberIn(slot.day, 1, 7, null);
    const evidence = String(slot.sectionEvidence || '').trim();
    const match = evidence.match(/(?:第\s*)?(\d{1,2})\s*(?:[-~～至]\s*(\d{1,2}))?\s*节/);
    const s1 = match ? numberIn(Number(match[1]), 1, context.sectionCount, null) : null;
    const s2 = match ? numberIn(Number(match[2] || match[1]), 1, context.sectionCount, null) : null;
    const explicit = s1 && s2 && s2 >= s1;
    const suggestion = explicit ? null : sectionSuggestion(slot.sectionHint, context.sections, context.breaks);
    return day ? Object.assign({ day, s1: explicit ? s1 : null, s2: explicit ? s2 : null, dayUncertain:!!slot.dayUncertain, daySource:slot.daySource === 'ocr' ? 'ocr' : 'vision' }, suggestion || {}) : null;
  }).filter(Boolean).slice(0, 7);
  if (!slots.length) return null;
  const week = ['all', 'odd', 'even', 'custom'].includes(raw.week) ? raw.week : 'all';
  const weekEvidence = String(raw.weekEvidence || '').trim();
  const range = weekEvidence.match(/(?:第\s*)?(\d{1,2})\s*[-~～至]\s*(\d{1,2})\s*周/);
  const wf = range ? numberIn(Number(range[1]), 1, context.weeks, null) : null;
  const wt = range ? numberIn(Number(range[2]), wf || 1, context.weeks, null) : null;
  return {
    name,
    loc: String(raw.loc || '').trim().slice(0, 60),
    teacher: String(raw.teacher || '').trim().slice(0, 40),
    owner: context.owner,
    slots,
    day: slots[0].day,
    s1: slots[0].s1,
    s2: slots[0].s2,
    week,
    wf,
    wt,
    customParity: ['all', 'odd', 'even'].includes(raw.customParity) ? raw.customParity : 'all',
    warning: [String(raw.warning || '').trim(), (!wf || !wt) ? '截图未显示课程周次范围，审阅页已按当前学期预填，请核对' : '', slots.some(slot => !slot.s1 || !slot.s2) ? '截图没有明确节次，请逐项选择开始和结束节' : '', slots.length < (raw.slots || []).length ? '部分时段无效，已移除，请核对原图' : ''].filter(Boolean).join('；').slice(0, 240)
  };
}
function mergeMatchingCourses(courses) {
  const byIdentity = new Map();
  for (const course of courses) {
    const identity = JSON.stringify([course.name, course.loc, course.teacher, course.week, course.wf, course.wt, course.customParity]);
    const existing = byIdentity.get(identity);
    if (!existing) { byIdentity.set(identity, course); continue; }
    for (const slot of course.slots) {
      if (!existing.slots.some(item => item.day === slot.day && item.s1 === slot.s1 && item.s2 === slot.s2 && item.suggestedS1 === slot.suggestedS1 && item.suggestedS2 === slot.suggestedS2)) existing.slots.push(slot);
    }
    if (course.warning && !existing.warning.includes(course.warning)) existing.warning = [existing.warning, course.warning].filter(Boolean).join('；').slice(0, 240);
  }
  return Array.from(byIdentity.values()).map(course => {
    Object.assign(course, course.slots[0]);
    return course;
  });
}
function parseModelJson(content, context, ocr) {
  const text = String(content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let parsed;
  try { parsed = JSON.parse(text); } catch (_) { throw Object.assign(new Error('识别结果格式异常，请重试'), { code: 'MODEL_FORMAT_ERROR' }); }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.courses)) throw Object.assign(new Error('识别结果格式异常，请重试'), { code: 'MODEL_FORMAT_ERROR' });
  const validCourses = reconcileDays(parsed, ocr).courses.map(course => normalizeCourse(course, context)).filter(Boolean);
  const mergedCourses = mergeMatchingCourses(validCourses);
  const courses = mergedCourses.slice(0, MAX_COURSES);
  const warnings = (Array.isArray(parsed.warnings) ? parsed.warnings : []).map(value => String(value).slice(0, 160)).slice(0, 10);
  if (validCourses.length < parsed.courses.length || mergedCourses.length > MAX_COURSES) warnings.push('部分课程缺少有效名称或时段，或超过单次识别上限，未加入结果；请对照原图补充。');
  if (ocr && courses.some(course => course.slots.some(slot => slot.dayUncertain))) warnings.push('部分课程无法通过文字位置确认星期，请对照原图核对。');
  return { courses, warnings };
}
function instruction(context, ocr) {
  const layout = ocr && ocr.lines.length ? `\n\n以下是 OCR 识别的文字和原图坐标 [id,文字,左,上,右,下]；它可能有错，必须结合图片判断。每个课程时段的 sourceIds 至少填写该卡片课程名称文字的 id；同名课程不同卡片分别引用不同 id。分区图按原图从上到下排列，横坐标不变。\n${JSON.stringify(ocr.lines.slice(0, 250).map(line => [line.id,line.text,...line.box]))}` : '';
  return `你是高校课表识别助手。识别图片中的课程，绝不猜测模糊、遮挡或不存在的信息。\n\n输出唯一的 JSON 对象，不要 Markdown：\n{"courses":[{"name":"课程名","loc":"地点或空字符串","teacher":"教师或空字符串","slots":[{"day":1,"sourceIds":["t1"],"sectionEvidence":"图片中明确写出的节次文字；没有则空字符串","sectionHint":"morning_first|morning_second|morning_all|afternoon_first|afternoon_second|afternoon_all|evening_first|evening_second|evening_all|空字符串"}],"week":"all|odd|even|custom","weekEvidence":"图片中明确写出的课程周次范围；没有则空字符串","customParity":"all|odd|even","warning":"不确定时说明"}],"warnings":["整张图层面的提醒"]}\n\nday 为周一=1到周日=7。sectionEvidence 只能原样抄录图片明确写出的“第1-2节”“1节”等字样，不能写推测内容；没有则空字符串。若有清晰午休和晚休分隔线，且同一时间段的课程卡片明确分成上下两排，可在 sectionHint 写位置：午休前上排 morning_first、下排 morning_second、跨两排 morning_all；午休与晚休之间用 afternoon；晚休后用 evening。逐张卡片定位日期列和区域，同名课程不同日期分别定位，不能照抄。只看到一个模糊的课程位置、无法确定上下排或分隔线时 sectionHint 为空。教室号末尾数字不能当节次。只有图片明确写出课程周次范围如“1-16周”，才在 weekEvidence 原样抄录。顶部“WEEK 4”、日期、用户学期总周数只表示当前视图，不能当成课程周次范围。不同周次或地点的同名课程分别输出。无法确定星期的课程不要输出，在 warnings 说明。同一课程的多次上课写进一个 slots 数组。用户的总周数是 ${context.weeks}。节次表：${JSON.stringify(context.sections)}${layout}`;
}
async function useQuota(key) {
  const day = new Date().toISOString().slice(0, 10);
  const id = `${day}_${key}`;
  try {
    const ref = db.collection(LIMIT_COLLECTION).doc(id);
    let current = null;
    try { current = (await ref.get()).data; } catch (_) { /* 第一次调用 */ }
    if (current && current.count >= DAILY_LIMIT) throw Object.assign(new Error('今天的图片识别次数已用完，请明天再试'), { code: 'RATE_LIMITED' });
    if (current) await ref.update({ data: { count: current.count + 1, updatedAt: db.serverDate() } });
    else await ref.set({ data: { count: 1, day, createdAt: db.serverDate(), updatedAt: db.serverDate() } });
    return;
  } catch (error) {
    if (error && error.code === 'RATE_LIMITED') throw error;
    // 当前环境可能未启用 NoSQL；降级为当前实例内限流，仍由网关 QPS 限制兜底。
    const count = memoryQuota.get(id) || 0;
    if (count >= DAILY_LIMIT) throw Object.assign(new Error('今天的图片识别次数已用完，请明天再试'), { code: 'RATE_LIMITED' });
    memoryQuota.set(id, count + 1);
  }
}
function visionConfig(env) {
  const provider = String(env.SCHEDULE_VISION_PROVIDER || 'tokenhub').trim().toLowerCase();
  if (provider === 'deepseek') {
    const apiKey = String(env.DEEPSEEK_API_KEY || '').trim();
    if (!apiKey) throw Object.assign(new Error('DeepSeek 识图服务正在配置中，请稍后再试'), { code: 'DEEPSEEK_NOT_CONFIGURED' });
    return { provider, apiKey, url: 'https://api.deepseek.com/chat/completions', model: 'deepseek-flash' };
  }
  if (provider !== 'tokenhub') throw Object.assign(new Error('识图服务配置有误，请联系管理员'), { code: 'VISION_PROVIDER_INVALID' });
  const apiKey = String(env.TOKENHUB_API_KEY || '').trim();
  if (!apiKey) throw Object.assign(new Error('图片识别服务正在配置中，请稍后再试'), { code: 'TOKENHUB_NOT_CONFIGURED' });
  return { provider, apiKey, url: env.TOKENHUB_BASE_URL || 'https://tokenhub.tencentmaas.com/v1/chat/completions', model: env.TOKENHUB_VISION_MODEL || 'hy-vision-2.0-instruct' };
}
async function recognize(image, context, safetyId, ocr) {
  const config = visionConfig(process.env);
  const images = ocr && ocr.crops.length && config.provider === 'deepseek' ? [
    { type:'image_url', image_url:{ url:image, detail:'low' } },
    ...ocr.crops.map(crop => ({ type:'image_url', image_url:{ url:crop.image, detail:'original' } }))
  ] : [{ type:'image_url', image_url:{ url:image, ...(config.provider === 'deepseek' ? { detail:'original' } : {}) } }];
  const body = {
    model: config.model,
    stream: false,
    temperature: 0.1,
    max_tokens: 4096,
    messages: [
      { role: 'system', content: instruction(context, ocr) },
      { role: 'user', content: [{ type: 'text', text: '请识别这张课程表图片。' }, ...images] }
    ]
  };
  if (config.provider === 'deepseek') {
    body.thinking = { type: 'disabled' };
    body.response_format = { type: 'json_object' };
  }
  const response = await fetch(config.url, {
    method: 'POST',
    signal: AbortSignal.timeout(50000),
    headers: { authorization: `Bearer ${config.apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const providerCode = String(payload && payload.error && payload.error.code || response.status);
    console.error('Vision request failed', { provider: config.provider, status: response.status, code: providerCode });
    const publicMessage = config.provider === 'deepseek'
      ? response.status === 401 ? 'DeepSeek 密钥无效，请联系管理员' : response.status === 402 ? 'DeepSeek 余额不足，请联系管理员' : 'DeepSeek 识图服务暂时不可用，请稍后再试'
      : providerCode === '401006' ? '课表识别模型尚未开通，请联系管理员' : ['401007', '401008'].includes(providerCode) ? '模型额度不足，请联系管理员' : '图片识别服务暂时不可用，请稍后再试';
    throw Object.assign(new Error(publicMessage), { code: `${config.provider.toUpperCase()}_${providerCode}` });
  }
  const choice = payload && payload.choices && payload.choices[0];
  if (choice && choice.finish_reason === 'length') throw Object.assign(new Error('课表内容过多，识别结果不完整，请分区域裁剪后重试'), { code: 'MODEL_OUTPUT_TRUNCATED' });
  const content = choice && choice.message && choice.message.content;
  return parseModelJson(content, context, ocr);
}

exports.main = async (event, runtimeContext) => {
  if (event && event.Type === 'Timer' && event.TriggerName === 'imageImportCleanup') {
    dbData(await pgDb.from(CHUNK_TABLE).delete().lt('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString()));
    dbData(await pgDb.from(OCR_TABLE).delete().lt('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString()));
    return { ok: true };
  }
  if (event && event.httpMethod === 'OPTIONS') return reply(event, { ok: true });
  try {
    const input = payloadOf(event);
    const context = {
      owner: input.owner === 'dog' ? 'dog' : 'cat',
      weeks: numberIn(input.weeks, 1, 40, 20),
      sectionCount: numberIn(input.sectionCount, 1, 20, 12),
      sections: Array.isArray(input.sections) ? input.sections.slice(0, 20).filter(item => item && typeof item === 'object').map(item => ({ s: String(item.s || ''), e: String(item.e || '') })) : []
    };
    if (!context.sections.length) throw Object.assign(new Error('缺少节次时间配置'), { code: 'INVALID_CONTEXT' });
    const lunchAfter = numberIn(input.lunchAfter, 1, context.sections.length - 1, null);
    const dinnerAfter = numberIn(input.dinnerAfter, 2, context.sections.length, null);
    context.breaks = lunchAfter && dinnerAfter && lunchAfter < dinnerAfter ? { lunchAfter, dinnerAfter } : null;
    const wxContext = cloud.getWXContext();
    const clientId = wxContext.OPENID || input.clientId || (event.headers && (event.headers['x-claswee-client'] || event.headers['X-Claswee-Client']));
    if (!clientId || String(clientId).length < 12) throw Object.assign(new Error('无法确认请求来源，请刷新后重试'), { code: 'INVALID_CLIENT' });
    const safetyId = hash(clientId).slice(0, 64);
    visionConfig(process.env);
    if (input.action === 'upload') return reply(event, Object.assign({ ok: true }, await uploadChunk(input, safetyId)));
    if (input.action === 'cancel') { await clearChunks(uploadIdOf(input), safetyId); return reply(event, { ok: true }); }
    if (input.action === 'prepare') return reply(event, Object.assign({ ok:true }, await prepareOcr(input, safetyId)));
    let image;
    let ocr = null;
    if (input.action === 'recognize') {
      image = await assembledImage(input, safetyId);
      ocr = await preparedOcr(input, safetyId);
    } else { image = dataUrl(input.imageData); await useQuota(safetyId); }
    let result;
    try { result = await recognize(image, context, safetyId, ocr); }
    finally { if (input.action === 'recognize') await clearChunks(uploadIdOf(input), safetyId); }
    return reply(event, Object.assign({ ok: true }, result));
  } catch (error) {
    console.error('scheduleImageImport failed', { code: error && error.code, message: error && error.message });
    const internalCode = String(error && error.code || 'RECOGNIZE_FAILED');
    const isProviderAuthError = /^AuthFailure\./i.test(internalCode) || /UnauthorizedOperation/i.test(internalCode);
    const publicCode = isProviderAuthError ? 'MODEL_NOT_READY' : internalCode;
    const publicMessage = isProviderAuthError
      ? '图片识别服务正在配置中，请稍后再试'
      : error && error.message || '识别失败，请稍后重试';
    return reply(event, fail(publicCode, publicMessage), internalCode === 'RATE_LIMITED' ? 429 : 400);
  }
};

exports._test = { normalizeCourse, parseModelJson, dataUrl, sectionSuggestion, visionConfig, recognize, prepareOcr, mergeMatchingCourses, ocrHeaders, reconcileDays, sanitizeOcr };
