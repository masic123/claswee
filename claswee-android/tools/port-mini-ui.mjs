import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';

// Keep the Android views traceable to the actual mini-program, including rpx geometry.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const source = path.resolve(process.argv[2] || path.join(root, '../couple-schedule-v41/miniprogram'));
const target = path.join(root, 'src/mini');
const hashes = {};
function read(file) {
  const value = fs.readFileSync(path.join(source, file), 'utf8');
  hashes[file] = crypto.createHash('sha256').update(value).digest('hex');
  return value.replace(/\r\n/g, '\n');
}
function write(file, value) {
  const dest = path.join(target, file); fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, value);
}
export function rpx(value) {
  return value.replace(/(-?(?:\d*\.)?\d+)rpx\b/g, (_, n) => `calc(${n} * var(--rpx))`)
    .replace(/constant\(safe-area-inset-(top|bottom|left|right)\)/g, 'var(--safe-$1)')
    .replace(/env\(safe-area-inset-(top|bottom|left|right)\)/g, 'var(--safe-$1)');
}
function css(value) {
  const sheet = postcss.parse(value.replace(/@import\s+["'][^"']+skins\.wxss["'];?/g, ''));
  sheet.walkRules(rule => { rule.selector = rule.selector.replace(/(?<![\w.#-])(view|text|image|picker|page)(?![\w-])/g, word => ({ view: 'div', text: 'span', image: 'img', picker: '.mini-picker', page: '.mini-page' })[word]); });
  return rpx(sheet.toString());
}
function expr(value) {
  const single = /^\{\{([\s\S]*)\}\}$/.exec(value);
  if (single) return single[1];
  const pieces = []; let end = 0;
  for (const match of value.matchAll(/\{\{([\s\S]*?)\}\}/g)) {
    if (match.index > end) pieces.push(JSON.stringify(value.slice(end, match.index)));
    pieces.push(`(${match[1]})`); end = match.index + match[0].length;
  }
  if (end < value.length) pieces.push(JSON.stringify(value.slice(end)));
  return pieces.join(' + ') || JSON.stringify(value);
}
const escape = value => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
function convert(wxml) {
  const fields = new Set(), locals = new Set(['item', 'index', 'row', 'rest', 'card', 'slot', 'slotIndex']);
  for (const match of wxml.matchAll(/wx:for-(?:item|index)="([^"]+)"/g)) locals.add(match[1]);
  for (const match of wxml.matchAll(/\{\{([\s\S]*?)\}\}/g)) {
    const clean = match[1].replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, '');
    for (const token of clean.matchAll(/(?<![\w.])([A-Za-z_$][\w$]*)/g)) {
      if (!locals.has(token[1]) && !['true', 'false', 'null', 'undefined', 'Math'].includes(token[1])) fields.add(token[1]);
    }
  }
  const stack = [];
  const template = wxml.replace(/<message-note\b[^>]*\/\s*>/g, '').replace(/<\/?[\w-]+\b(?:"[^"]*"|'[^']*'|[^'">])*>/g, token => {
    const match = /^<(\/?)([\w-]+)([\s\S]*?)(\/?)>$/.exec(token);
    if (!match) return token;
    const [, closing, tag, raw, slash] = match;
    const names = { view: 'div', text: 'span', image: 'img', 'scroll-view': 'div', picker: 'MiniPicker', switch: 'MiniSwitch', block: 'template' };
    const name = names[tag] || tag;
    if (closing) {
      const current = stack.pop();
      if (!current || current.tag !== tag) throw new Error(`Mismatched WXML tag ${tag}`);
      return `</${name}>${current.loop ? '</template>' : ''}`;
    }
    const attrs = Object.fromEntries([...raw.matchAll(/([^\s=]+)(?:="([^"]*)")?/g)].map(x => [x[1], x[2] ?? true]));
    const loop = attrs['wx:for'], item = attrs['wx:for-item'] || 'item', index = attrs['wx:for-index'] || 'index';
    const key = attrs['wx:key'];
    const keyExpr = key === '*this' ? item : key === 'index' || !key ? index : `${item}.${key}`;
    let before = loop ? `<template v-for="(${item}, ${index}) in ${escape(expr(loop))}" :key="${escape(keyExpr)}">` : '';
    const out = [];
    const data = Object.entries(attrs).filter(([key]) => key.startsWith('data-')).map(([key, value]) => `${JSON.stringify(key.slice(5).replace(/-([a-z])/g, (_, x) => x.toUpperCase()))}:(${expr(String(value))})`);
    const dataset = `{${data.join(',')}}`;
    for (let [key, value] of Object.entries(attrs)) {
      if (['wx:for', 'wx:for-item', 'wx:for-index', 'wx:key'].includes(key)) continue;
      if (key === 'wx:if' || key === 'wx:elif') { out.push(`${key === 'wx:if' ? 'v-if' : 'v-else-if'}="${escape(expr(value))}"`); continue; }
      if (key === 'wx:else') { out.push('v-else'); continue; }
      if (/^(bind|catch):?/.test(key)) {
        const event = key.replace(/^(bind|catch):?/, '');
        if (event === 'chooseavatar') continue;
        const mapped = { tap: 'click', input: 'input', blur: 'blur', change: 'change', columnchange: 'columnchange', cancel: 'cancel', touchmove: 'touchmove' }[event];
        if (!mapped) throw new Error(`Unsupported mini event ${event}`);
        out.push(`@${mapped}${key.startsWith('catch') ? '.stop' : ''}="fire('${value}', $event, ${escape(dataset)})"`); continue;
      }
      if (['hover-class', 'hover-stay-time', 'show-scrollbar', 'scroll-x', 'scroll-y', 'open-type', 'show-confirm-bar', 'placeholder-class', 'loading', 'password', 'mode'].includes(key) && !(key === 'mode' && tag === 'picker')) continue;
      if (key === 'aria-role') key = 'role';
      if (key === 'type' && value === 'nickname') value = 'text';
      if (key === 'class' && tag === 'scroll-view') value += ` mini-scroll ${attrs['scroll-x'] ? 'mini-scroll-x' : 'mini-scroll-y'}`;
      if (key === 'style') { out.push(`:style="rpxStyle(${escape(expr(String(value)))})"`); continue; }
      if (typeof value === 'string' && value.includes('{{')) out.push(`:${key}="${escape(expr(value))}"`);
      else if (value === true) out.push(key);
      else out.push(`${key}="${escape(value)}"`);
    }
    if (tag === 'button') out.push('type="button"');
    if (tag === 'input' && attrs.password) out.push('type="password"');
    if (tag === 'image') out.push(`alt=""${attrs.mode === 'aspectFill' ? ' style="object-fit:cover"' : ''}`);
    if (tag === 'scroll-view' && !attrs.class) out.push(`class="mini-scroll ${attrs['scroll-x'] ? 'mini-scroll-x' : 'mini-scroll-y'}"`);
    const empty = !!slash || ['image', 'input', 'switch'].includes(tag);
    if (!empty) stack.push({ tag, loop });
    return `${before}<${name}${out.length ? ' ' + out.join(' ') : ''}${empty ? ' />' : '>'}${empty && loop ? '</template>' : ''}`;
  });
  return { template, fields: [...fields] };
}
function moduleCode(file) {
  return read(file).replace(/const (\w+) = require\(['"]([^'"]+)['"]\);/g, (_, name, spec) => `import ${name} from './${path.basename(spec)}.js';`)
    .replace(/module\.exports = /g, 'export default ');
}
for (const util of ['schedule-grid', 'schedule-hours', 'schedule-day', 'skin-palette', 'poster']) write(`utils/${util}.js`, moduleCode(`utils/${util}.js`));
for (const page of ['schedule', 'settings', 'add']) {
  let code = read(`pages/${page}/index.js`).replace(/const (\w+) = require\(['"]\.\.\/\.\.\/utils\/([^'"]+)['"]\);/g, (_, name, util) => `import ${name} from '../utils/${util}.js';`).replace(/Page\(/, 'export default (');
  write(`controllers/${page}.js`, `// Ported from miniprogram/pages/${page}/index.js.\n${code}`);
}
for (const [page, component] of [['schedule', 'Schedule'], ['settings', 'Settings'], ['add', 'Add'], ['sync', 'Sync'], ['image-import', 'ImageImport'], ['share-poster', 'Poster']]) {
  let markup = read(`pages/${page}/index.wxml`);
  if (page === 'settings') {
    markup = markup.replace('微信头像和昵称需要分别选择，不会弹出一次性获取资料的授权框。头像点下方按钮，昵称点右侧输入框。', '点击头像可从相册选择，昵称可以直接修改。')
      .replace(/bindtap="onWechatAvatarTap"/g, 'data-owner="{{me}}" bindtap="uploadAvatar"')
      .replace(/点击选择微信昵称/g, '点击修改昵称').replace(/选择微信头像/g, '选择头像');
    const extra = `<view class="card app-information"><view class="title">关于 claswee</view><button class="soft" bindtap="privacy">隐私说明与云服务</button><button class="soft" bindtap="terms">使用约定</button><text class="hint">claswee 情侣课表 · 安卓测试版 ${version}</text></view>`;
    markup = markup.replace('<view wx:if="{{emojiSheet}}"', extra + '\n<view wx:if="{{emojiSheet}}"');
  }
  if (page === 'sync') markup = markup.replace('open-type="share" data-share-kind="room-invite"', 'bindtap="invite" data-share-kind="room-invite"');
  const { template, fields } = convert(markup);
  write(`pages/${component}.vue`, `<script>\nimport { toRefs } from 'vue';\nimport controller from '../controllers/${page === 'add' ? 'add-native' : page}.js';\nimport { useMiniPage, rpxStyle } from '../runtime';\nimport MiniPicker from '../MiniPicker.vue';\nimport MiniSwitch from '../MiniSwitch.vue';\nexport default { name:'Mini${component}', components:{MiniPicker,MiniSwitch}, props:{query:Object}, setup(props) {\n  const page = useMiniPage(controller, props.query || {}, ${JSON.stringify(fields)}, '${component}');\n  return { ...toRefs(page.data), fire:page.fire, rpxStyle };\n}};\n</script>\n<template>\n${template}\n</template>\n<style scoped>\n${css(read(`pages/${page}/index.wxss`))}\n</style>\n`);
}
for (const [sourceFile, output] of [['custom-tab-bar/index', 'TabBar'], ['components/message-note/index', 'Note']]) {
  const { template, fields } = convert(read(`${sourceFile}.wxml`));
  write(`${output}.vue`, `<script>\nimport {toRefs} from 'vue';\nimport controller from './controllers/${output.toLowerCase()}.js';\nimport {useMiniPage,rpxStyle} from './runtime';\nexport default {name:'Mini${output}',setup(){const page=useMiniPage(controller,{},${JSON.stringify(fields)},'${output}');return {...toRefs(page.data),fire:page.fire,rpxStyle};}};\n</script>\n<template>\n${template}\n</template>\n<style scoped>\n${css(read(`${sourceFile}.wxss`))}\n</style>\n`);
}
write('base.css', css(read('app.wxss').replace('@import "styles/skins.wxss";', read('styles/skins.wxss'))));
fs.mkdirSync(path.join(root, 'public/assets'), { recursive: true });
fs.copyFileSync(path.join(source, 'assets/claswee-mini-code.jpg'), path.join(root, 'public/assets/claswee-mini-code.jpg'));
fs.writeFileSync(path.join(root, 'artifacts/mini-ui-source-map.json'), JSON.stringify({ source, generatedBy: 'tools/port-mini-ui.mjs', rpx: 'viewport width / 750', platformChanges: ['Android system navigation and file picker', 'WeChat profile picker replaced by album and nickname input', 'Android privacy and cloud-service controls'], sha256: hashes }, null, 2));
console.log(`Ported ${Object.keys(hashes).length} mini-program source files without modifying the originals.`);
