const Day = require('./schedule-day');
const Store = require('./store');
const Grid = require('./schedule-grid');
const Skin = require('./skin');
const Palette = require('./skin-palette');
const PAGE_WIDTH = 750, GRID_Y = 386, HEAD_HEIGHT = 102, FOOTER_HEIGHT = 162, SCALE = 2;
function model(data, date, maskCourses = false, options = {}) {
  const weekday = new Date(Day.dayNumber(date) * 86400000).getUTCDay() || 7;
  const start = Day.addDays(date, 1 - weekday), includeWeekend = options.includeWeekend !== false, dayCount = includeWeekend ? 7 : 5;
  const parts = start.split('-').map(Number), startDate = new Date(parts[0], parts[1] - 1, parts[2]);
  const filter = ['cat','dog'].includes(options.filter) ? options.filter : 'both';
  const grid = Grid.build(data, startDate, filter, { includeWeekend });
  const columns = grid.columns.map(column => ({ ...column, cards: column.cards.map(card => {
    const sections = data.settings[card.owner === 'dog' ? 'dogSections' : 'catSections'];
    const time = `${(sections[card.s1 - 1] || {}).s || ''}–${(sections[card.s2 - 1] || {}).e || ''}`;
    if (!maskCourses) return { ...card, time };
    return { owner: card.owner, s1: card.s1, s2: card.s2, single: card.single, narrow: card.narrow, top: card.top, height: card.height, leftPercent: card.leftPercent, widthPercent: card.widthPercent, sectionText: card.sectionText, time, masked: true };
  }) }));
  const clean = entries => entries.map(item => maskCourses ? { owner: item.owner, s1: item.s1, s2: item.s2, time: item.time, masked: true } : { owner: item.owner, s1: item.s1, s2: item.s2, time: item.time, name: item.name, loc: item.loc, teacher: item.teacher });
  const days = Array.from({ length: dayCount }, (_, index) => {
    const day = Day.summary(data, Day.addDays(start, index));
    return { date: day.date, name: ['周一','周二','周三','周四','周五','周六','周日'][index], cat: filter === 'dog' ? [] : clean(day.cat), dog: filter === 'cat' ? [] : clean(day.dog) };
  });
  const week = Math.floor((Day.dayNumber(start) - Day.dayNumber(Store.calendarStart(data))) / 7) + 1;
  const ownWeek = owner => { const value = Store.weekForDate(data, owner, startDate); return value < 1 ? '开学前' : `第${value}周`; };
  const skin = Skin.normalize(options.skin || Skin.get());
  return { width: PAGE_WIDTH * SCALE, height: (GRID_Y + HEAD_HEIGHT + grid.gridHeight + FOOTER_HEIGHT) * SCALE, start, end: Day.addDays(start, dayCount - 1), week, days,
    columns, restRows: grid.restRows, gridHeight: grid.gridHeight, sections: grid.sectionCount, rowHeight: 100,
    catName: String(data.users.cat.name || '小猫'), dogName: String(data.users.dog.name || '小狗'), catAvatar: String(data.users.cat.avatar || '🐱'), dogAvatar: String(data.users.dog.avatar || '🐶'),
    catWeek: ownWeek('cat'), dogWeek: ownWeek('dog'), skin, filter, maskCourses };
}
function round(ctx, x, y, w, h, r, color) {
  r = Math.min(r, w / 2, h / 2); ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  if (color) { ctx.fillStyle = color; ctx.fill(); }
}
function fit(ctx, text, width) {
  const chars = Array.from(String(text || '')); if (ctx.measureText(chars.join('')).width <= width) return chars.join('');
  while (chars.length && ctx.measureText(chars.join('') + '…').width > width) chars.pop(); return chars.join('') + '…';
}
function label(ctx, value, x, y, size, color, width, weight = 'normal', align = 'center') {
  ctx.font = `${weight} ${size}px "Microsoft YaHei", "PingFang SC", sans-serif`;
  ctx.fillStyle = color; ctx.textBaseline = 'middle'; ctx.textAlign = align; ctx.fillText(width ? fit(ctx, value, width) : value, x, y);
}
function gradient(ctx, x, y, w, h, colors) {
  const result = ctx.createLinearGradient(x, y, x + w, y + h); colors.forEach((color, index) => result.addColorStop(index / (colors.length - 1), color)); return result;
}
function heart(ctx, x, y, color) {
  ctx.save(); ctx.translate(x, y); ctx.beginPath(); ctx.moveTo(0, 12);
  ctx.bezierCurveTo(-26, -5, -13, -26, 0, -12); ctx.bezierCurveTo(13, -26, 26, -5, 0, 12); ctx.fillStyle = color; ctx.fill(); ctx.restore();
}
function avatar(ctx, source, image, cx, palette, owner) {
  ctx.save(); ctx.shadowColor = 'rgba(131,78,103,.14)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 4;
  ctx.beginPath(); ctx.arc(cx, 83, 59, 0, Math.PI * 2); ctx.fillStyle = palette[owner]; ctx.fill(); ctx.shadowColor = 'transparent';
  ctx.beginPath(); ctx.arc(cx, 83, 54, 0, Math.PI * 2); ctx.fillStyle = palette[`${owner}Soft`]; ctx.fill(); ctx.clip();
  if (image) { const crop = Math.min(image.width, image.height); ctx.drawImage(image, (image.width - crop) / 2, (image.height - crop) / 2, crop, crop, cx - 54, 29, 108, 108); }
  else label(ctx, /^(data:|cloud:\/\/|https?:\/\/|wxfile:\/\/|\/)/.test(source) ? (owner === 'cat' ? '🐱' : '🐶') : source, cx, 85, 56, palette.text, 98);
  ctx.restore();
}
function paw(ctx, x, y, color) {
  ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y + 12, 18, 15, 0, 0, Math.PI * 2); ctx.fill();
  [[-24,-12],[-8,-24],[10,-24],[26,-12]].forEach(([dx,dy]) => { ctx.beginPath(); ctx.arc(x + dx, y + dy, 7.4, 0, Math.PI * 2); ctx.fill(); });
}
function wrapped(ctx, text, width, maxLines) {
  const chars = Array.from(String(text || '')), lines = []; let line = '';
  while (chars.length) {
    const char = chars.shift();
    if (line && ctx.measureText(line + char).width > width) { lines.push(line); line = char; } else line += char;
    if (lines.length === maxLines - 1 && ctx.measureText(line + chars.join('')).width > width) { lines.push(fit(ctx, line + chars.join(''), width)); return lines; }
  }
  if (line) lines.push(line); return lines.slice(0, maxLines);
}
function course(ctx, item, x, y, width, palette) {
  const h = item.height, ink = palette[`${item.owner}Ink`], meta = !!(item.loc || item.teacher);
  const mark = item.owner === 'dog' ? '🦴' : '🐾';
  function drawMark() {
    ctx.globalAlpha = .65;
    label(ctx, mark, x + width - 4, y + h - 13, 20, ink, undefined, 'normal', 'right');
  }
  ctx.save(); ctx.shadowColor = 'rgba(180,88,125,.15)'; ctx.shadowBlur = 9; ctx.shadowOffsetY = 3;
  round(ctx, x, y, width, h, 13, gradient(ctx, x, y, width, h, palette[`${item.owner}Course`]));
  ctx.shadowColor = 'transparent'; round(ctx, x, y, width, h, 13); ctx.clip();
  if (item.masked) {
    ctx.strokeStyle = ink; ctx.globalAlpha = .09; ctx.lineWidth = 5;
    for (let offset = -h; offset < width + h; offset += 28) { ctx.beginPath(); ctx.moveTo(x + offset, y + h); ctx.lineTo(x + offset + h, y); ctx.stroke(); }
    ctx.globalAlpha = 1; label(ctx, '上课中', x + width / 2, y + h / 2 - 12, item.narrow ? 22 : 24, ink, width - 8, 'bold');
    const corner = item.single ? 32 : 0;
    label(ctx, item.time, x + (width - corner) / 2, y + h / 2 + 17, 18, ink, width - 8 - corner); drawMark(); ctx.restore(); return;
  }
  const fontSize = item.narrow ? 22 : 24;
  ctx.font = `bold ${fontSize}px "Microsoft YaHei", "PingFang SC", sans-serif`;
  const lines = wrapped(ctx, item.displayName, width - 8, item.narrow || (item.single && meta) ? 1 : 2);
  const details = [item.loc ? `📍${item.loc}` : '', item.teacher ? `👤${item.teacher}` : '', !meta && !item.single ? item.sectionText : ''].filter(Boolean);
  const lineHeight = fontSize * 1.18, detailHeight = 22.7;
  const contentHeight = lines.length * lineHeight + details.length * detailHeight;
  let lineY = y + (h - contentHeight - (meta ? 0 : 19)) / 2 + lineHeight / 2;
  lines.forEach(text => { label(ctx, text, x + width / 2, lineY, fontSize, ink, width - 8, 'bold'); lineY += lineHeight; });
  lineY += (detailHeight - lineHeight) / 2;
  details.forEach((text, index) => {
    const corner = item.single && meta && index === details.length - 1 ? 32 : 0;
    label(ctx, text, x + (width - corner) / 2, lineY, 18, ink, width - 8 - corner); lineY += detailHeight;
  });
  drawMark();
  ctx.restore();
}
function draw(ctx, data, options = {}) {
  const palette = Palette.get(data.skin), boardWidth = PAGE_WIDTH - 24, dayWidth = boardWidth / data.columns.length;
  ctx.clearRect(0, 0, data.width, data.height); ctx.save(); ctx.scale(SCALE, SCALE);
  ctx.fillStyle = palette.bg; ctx.fillRect(0, 0, PAGE_WIDTH, data.height / SCALE);
  round(ctx, 0, -40, PAGE_WIDTH, 322, 40, gradient(ctx, 0, 0, PAGE_WIDTH, 282, palette.hero));
  ctx.save(); round(ctx, 0, -40, PAGE_WIDTH, 322, 40); ctx.clip();
  if (data.skin === 'night') {
    ctx.fillStyle = '#e3d6ff'; ctx.globalAlpha = .45;
    for (let y = 26; y < 282; y += 86) for (let x = 30; x < PAGE_WIDTH; x += 114) { ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill(); }
  } else {
    ctx.globalAlpha = data.skin === 'blush' ? .45 : .16;
    for (let y = 45; y < 310; y += 92) for (let x = 46; x < PAGE_WIDTH; x += 92) paw(ctx, x, y, data.skin === 'blush' ? '#ffc9dc' : palette.line);
  }
  ctx.restore();
  avatar(ctx, data.catAvatar, options.catAvatarImage, 249, palette, 'cat'); avatar(ctx, data.dogAvatar, options.dogAvatarImage, 501, palette, 'dog');
  label(ctx, data.catName, 249, 165, 26, palette.catInk, 170, 'bold'); label(ctx, data.dogName, 501, 165, 26, palette.dogInk, 170, 'bold'); heart(ctx, 375, 93, palette.cat);
  const filterLabel = data.filter === 'both' ? '一起看' : data[`${data.filter}Name`];
  round(ctx, 148, 202, 264, 58, 29, palette.card); round(ctx, 424, 202, 178, 58, 29, palette.card);
  label(ctx, '◉', 170, 231, 21, palette.cat); label(ctx, '谁的课表', 228, 231, 21, palette.text, 92, 'bold'); label(ctx, filterLabel, 330, 231, 21, palette.catInk, 91, 'bold'); label(ctx, '⌄', 392, 231, 22, palette.muted);
  label(ctx, '▦', 446, 231, 24, palette.dog); label(ctx, '视图', 481, 231, 21, palette.text); label(ctx, '按节数', 546, 231, 21, palette.cat, 72, 'bold'); label(ctx, '⌄', 586, 231, 22, palette.muted);
  round(ctx, 22, 303, 60, 60, 30, palette.card); round(ctx, 668, 303, 60, 60, 30, palette.card);
  label(ctx, '‹', 52, 330, 42, palette.text); label(ctx, '›', 698, 330, 42, palette.text); label(ctx, `第 ${data.week} 周`, 375, 322, 32, palette.text, 560, 'bold');
  const dateText = value => { const parts = value.split('-').map(Number); return `${parts[1]}.${parts[2]}`; };
  label(ctx, `${dateText(data.start)} – ${dateText(data.end)} · ${data.catName}${data.catWeek} / ${data.dogName}${data.dogWeek}`, 375, 360, 20, palette.muted, 564);
  const bodyY = GRID_Y + HEAD_HEIGHT, bottom = bodyY + data.gridHeight;
  ctx.save(); round(ctx, 12, GRID_Y, boardWidth, HEAD_HEIGHT + data.gridHeight, 24, palette.grid); ctx.clip();
  ctx.fillStyle = palette.surface; ctx.fillRect(12, GRID_Y, boardWidth, HEAD_HEIGHT);
  ctx.strokeStyle = palette.line; ctx.lineWidth = 1;
  data.columns.forEach((column, index) => {
    const x = 12 + index * dayWidth;
    ctx.beginPath(); ctx.moveTo(x, GRID_Y); ctx.lineTo(x, bottom); ctx.stroke();
    label(ctx, column.name, x + dayWidth / 2, GRID_Y + 23, 25, palette.text, dayWidth - 6, 'bold');
    label(ctx, column.date, x + dayWidth / 2, GRID_Y + 48, 19, palette.text, dayWidth - 6);
    if (column.adjustmentLabel) label(ctx, column.adjustmentLabel, x + dayWidth / 2, GRID_Y + 74, 17, palette.catInk, dayWidth - 6);
    column.rows.forEach(row => { const y = bodyY + row.top + row.height; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dayWidth, y); ctx.stroke(); });
    column.cards.forEach(item => course(ctx, item, x + item.leftPercent * dayWidth + 3, bodyY + item.top, item.widthPercent * dayWidth - 6, palette));
  });
  ctx.beginPath(); ctx.moveTo(12, bodyY); ctx.lineTo(PAGE_WIDTH - 12, bodyY); ctx.stroke();
  data.restRows.forEach(rest => {
    const y = bodyY + rest.top; ctx.fillStyle = palette.catSoft; ctx.fillRect(12, y, boardWidth, rest.height);
    ctx.strokeStyle = palette.line; ctx.beginPath(); ctx.moveTo(12, y); ctx.lineTo(PAGE_WIDTH - 12, y); ctx.moveTo(12, y + rest.height); ctx.lineTo(PAGE_WIDTH - 12, y + rest.height); ctx.stroke();
    label(ctx, rest.label, 375, y + rest.height / 2, 18, palette.muted, 160);
  });
  ctx.restore();
  label(ctx, 'claswee', 28, bottom + 75, 30, palette.text, 430, 'bold', 'left');
  if (data.maskCourses) label(ctx, '课程已打码', 28, bottom + 110, 20, palette.muted, 430, 'normal', 'left');
  if (options.qrImage) {
    const size = 118, x = PAGE_WIDTH - 28 - size, y = bottom + 16;
    round(ctx, x - 4, y - 4, size + 8, size + 8, 13, '#fff'); ctx.drawImage(options.qrImage, x, y, size, size); label(ctx, '扫码查看', x + size / 2, bottom + 147, 17, palette.muted, size);
  }
  ctx.restore();
}
module.exports = { model, draw };
