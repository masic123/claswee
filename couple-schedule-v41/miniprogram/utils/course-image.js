const Sync = require('./sync');
const URL = 'https://masic-blog-d6g6d4r87bc035c0e-1324333320.ap-shanghai.app.tcloudbase.com/schedule-image-import';
const CHUNK_CHARS = 80000;
const CONCURRENCY = 4;
const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

function request(payload, clientId) {
  return new Promise((resolve, reject) => wx.request({
    url: URL, method: 'POST', timeout: 65000,
    header: { 'Content-Type': 'application/json', 'X-Claswee-Client': clientId },
    data: Object.assign({ clientId }, payload),
    success(response) {
      let result = response.data;
      try { if (typeof result === 'string') result = JSON.parse(result); } catch (_) { result = null; }
      if (result && result.ok) resolve(result);
      else reject(new Error(result && result.message || `识别失败（HTTP ${response.statusCode}）`));
    },
    fail: error => reject(new Error(/timeout/i.test(error && error.errMsg || '') ? '图片识别超时，请重试' : '图片服务连接失败，请检查网络后重试'))
  }));
}

function choose() {
  return new Promise((resolve, reject) => {
   const options = { count: 1, sizeType: ['original'],
    success(result) {
      const file = result.tempFiles && result.tempFiles[0];
      const filePath = file && (file.tempFilePath || file.path) || result.tempFilePaths && result.tempFilePaths[0];
      if (!filePath) return resolve(null);
      if (!file || !file.size || file.size <= 3 * 1024 * 1024) return resolve(filePath);
      wx.compressImage({ src: filePath, quality: 85,
        success: compressed => resolve(compressed.tempFilePath), fail: () => resolve(filePath) });
    },
    fail: error => /cancel/i.test(error && error.errMsg || '') ? resolve(null) : reject(new Error('没有选到图片，请重试'))
   };
   if (typeof wx.chooseMedia === 'function') wx.chooseMedia({ ...options, mediaType: ['image'] });
   else wx.chooseImage(options);
  });
}

async function recognize(imagePath, data, owner, { progress = () => {}, cancelled = () => false } = {}) {
  const sections = owner === 'dog' ? data.settings.dogSections : data.settings.catSections;
  const check = () => { if (cancelled()) throw new Error('页面已关闭'); };
  const file = await new Promise((resolve, reject) => wx.getFileSystemManager().readFile({
    filePath: imagePath, encoding: 'base64', success: resolve, fail: () => reject(new Error('图片读取失败，请重新选择'))
  }));
  check();
  if (file.data.length > 4 * 1024 * 1024) throw new Error('图片过大，请裁剪后重试（压缩后不超过 3MB）');
  const mime = file.data.startsWith('iVBOR') ? 'png' : file.data.startsWith('/9j/') ? 'jpeg' : file.data.startsWith('UklGR') ? 'webp' : '';
  if (!mime) throw new Error('请选择 JPG、PNG 或 WEBP 图片');
  const clientId = Sync.config().clientId;
  const uploadId = `i${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  const partCount = Math.ceil(file.data.length / CHUNK_CHARS);
  const context = { uploadId, owner, weeks: data.settings.weeks, sectionCount: sections.length, sections,
    lunchAfter: data.settings.lunchAfter, dinnerAfter: data.settings.dinnerAfter };
  const uploadPart = partIndex => request({ action: 'upload', uploadId, partIndex, partCount, mime,
    content: file.data.slice(partIndex * CHUNK_CHARS, (partIndex + 1) * CHUNK_CHARS), sections }, clientId);
  try {
    progress('正在上传课表图片…');
    await uploadPart(0);
    for (let start = 1; start < partCount; start += CONCURRENCY) {
      check();
      const indexes = Array.from({ length: Math.min(CONCURRENCY, partCount - start) }, (_, i) => start + i);
      const settled = await Promise.all(indexes.map(i => uploadPart(i).then(() => null, error => error)));
      const failed = settled.find(error => error);
      if (failed) throw failed;
      check(); progress(`正在上传图片 ${Math.min(start + CONCURRENCY, partCount)}/${partCount}…`);
    }
    check(); progress('正在提取课表文字和位置…');
    const prepared = await request({ ...context, action: 'prepare' }, clientId)
      .catch(() => ({ ocrReady: false, message: '文字定位暂不可用，请仔细核对星期和节次。' }));
    check(); progress(prepared.message || 'AI 正在整理图片里的课程…');
    const result = await request({ ...context, action: 'recognize' }, clientId);
    check();
    if (!prepared.ocrReady) result.warnings = [prepared.message, ...(result.warnings || [])].filter(Boolean);
    return result;
  } catch (error) {
    request({ action: 'cancel', uploadId, sections }, clientId).catch(() => {});
    throw error;
  }
}

// Image results enter the same draft pipeline as text; this function never saves.
function drafts(result, owner, makeId) {
  const entries = [], sources = [], ownerEvidence = owner === 'dog' ? '小狗' : '小猫';
  for (const course of Array.isArray(result.courses) ? result.courses : []) {
    if (!course || typeof course.name !== 'string' || !course.name.trim()) continue;
    const imageReview = [];
    const slots = (Array.isArray(course.slots) ? course.slots : []).map(value => {
      const slot = value || {};
      const explicit = Number.isInteger(slot.s1) && Number.isInteger(slot.s2);
      if (!explicit && Number.isInteger(slot.suggestedS1) && Number.isInteger(slot.suggestedS2)) imageReview.push('节次来自图片位置推测，请对照原图核对。');
      if (slot.dayUncertain) imageReview.push('星期位置尚未核实，请对照原图核对。');
      return { day: slot.day, period: 'day', first: explicit ? slot.s1 : slot.suggestedS1 || null, last: explicit ? slot.s2 : slot.suggestedS2 || null };
    });
    const knownWeeks = Number.isInteger(course.wf) && Number.isInteger(course.wt);
    const time = slots.map(s => `${DAYS[s.day - 1] || '星期待补充'}第${s.first || '?'}到${s.last || '?'}节`).join('、');
    const parity = course.week === 'odd' || course.week === 'even' ? course.week : course.customParity || 'all';
    const repeat = knownWeeks ? `第${course.wf}到${course.wt}周，${parity === 'odd' ? '单周' : parity === 'even' ? '双周' : '每周'}` : '';
    const raw = { name: course.name.trim(), owner, location: course.loc || '', teacher: course.teacher || '', slots,
      repeat: { kind: knownWeeks ? 'range' : null, from: knownWeeks ? course.wf : null, to: knownWeeks ? course.wt : null, parity, date: null },
      evidence: { name: course.name.trim(), owner: ownerEvidence, time, repeat } };
    const source = [ownerEvidence, raw.name, raw.location, raw.teacher, time, repeat].filter(Boolean).join('；');
    entries.push({ id: makeId(), selected: true, raw, origin: 'image', imageReview: [...new Set(imageReview)], imageWarning: course.warning || '' });
    sources.push(source);
  }
  return { entries, source: sources.join('\n') };
}

module.exports = { choose, recognize, drafts };
