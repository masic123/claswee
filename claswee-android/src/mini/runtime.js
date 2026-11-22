import { reactive, watch, onMounted, onBeforeUnmount, onActivated, onDeactivated, nextTick } from 'vue';
import { state, refreshMessages } from '../lib/state';
import { shareText } from '../lib/platform';
import { ui, pages, notify, navigate, navigateBack, switchTab, modal } from './navigation';

export function rpxStyle(value) {
  return String(value || '').replace(/(-?(?:\d*\.)?\d+)rpx\b/g, (_, n) => `calc(${n} * var(--rpx))`)
    .replace(/(?:env|constant)\(safe-area-inset-(top|bottom|left|right)\)/g, 'var(--safe-$1)');
}
export function chooseFile(accept) {
  return new Promise(resolve => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = accept;
    input.addEventListener('change', () => { resolve(input.files?.[0] || null); input.remove(); }, { once: true });
    input.addEventListener('cancel', () => { resolve(null); input.remove(); }, { once: true });
    input.style.display = 'none'; document.body.append(input); input.click();
  });
}
async function dataUrl(blob) {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
}
const selectedFiles = new Map();
async function readLocalFile(path) {
  if (selectedFiles.has(path)) return selectedFiles.get(path);
  const inline = /^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(path);
  if (inline) return new Blob([Uint8Array.from(atob(inline[2]), char => char.charCodeAt(0))], { type: inline[1] });
  return (await fetch(path)).blob();
}
export const wx = {
  setNavigationBarTitle({ title }) { ui.title = title; },
  setNavigationBarColor() {}, setBackgroundColor() {}, showShareMenu() {},
  navigateTo({ url }) { navigate(url); }, navigateBack,
  switchTab({ url }) { switchTab(url.split('/')[2]); },
  showToast({ title }) { notify(title); },
  showModal: modal,
  showLoading({ title }) { ui.loading = title; }, hideLoading() { ui.loading = ''; },
  async chooseMedia(options) {
    try {
      const file = await chooseFile('image/*');
      if (!file) return options.fail?.({ errMsg: 'cancel' });
      const path = URL.createObjectURL(file); selectedFiles.set(path, file);
      options.success?.({ tempFiles: [{ tempFilePath: path, size: file.size }] });
    } catch (error) { options.fail?.({ errMsg: error.message }); }
  },
  async compressImage(options) {
    try {
      const blob = await readLocalFile(options.src), bitmap = await createImageBitmap(blob);
      const scale = Math.min(1, options.compressedWidth / bitmap.width);
      const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
      options.success?.({ tempFilePath: canvas.toDataURL('image/jpeg', options.quality / 100) });
    } catch (error) { options.fail?.(error); }
  },
  getFileSystemManager() {
    return { async readFile(options) {
      try {
        const blob = await readLocalFile(options.filePath);
        options.success?.({ data: options.encoding === 'base64' ? (await dataUrl(blob)).split(',')[1] : await blob.text() });
      } catch (error) { options.fail?.(error); }
    } };
  },
  async setClipboardData({ data, success, fail }) { try { await shareText(data); success?.(); } catch (error) { fail?.(error); } },
};
globalThis.wx = wx;

export function useMiniPage(controller, query, fields, name) {
  const initial = structuredClone(controller.data || {});
  fields.forEach(key => { if (!(key in initial)) initial[key] = undefined; });
  const page = { data: reactive(initial), active: false, destroyed: false, name };
  const id = Symbol(name); pages.set(id, page);
  page.setData = (changes, done) => {
    for (const [key, value] of Object.entries(changes)) {
      const keys = key.replace(/\[(\d+)\]/g, '.$1').split('.'); let obj = page.data;
      keys.slice(0, -1).forEach(part => { obj = obj[part]; }); obj[keys.at(-1)] = value;
    }
    if (done) nextTick(done);
  };
  page.getTabBar = () => ({ setData() {} });
  page.triggerEvent = event => { if (event === 'close') ui.compose = false; };
  for (const [key, value] of Object.entries(controller)) if (typeof value === 'function') page[key] = value.bind(page);
  page.fire = (method, event, dataset = {}) => {
    const target = event?.currentTarget;
    const detail = event?.detail && typeof event.detail === 'object' ? event.detail : { value: target?.value ?? '' };
    const adapted = { detail, currentTarget: { dataset: { ...target?.dataset, ...dataset } }, target: { dataset: { ...target?.dataset, ...dataset } } };
    try {
      if (method === 'privacy' || method === 'terms') { ui.legal = method; return; }
      const result = page[method]?.(adapted);
      if (result?.catch) result.catch(error => notify(error.message || '操作失败，请重试'));
      return result;
    } catch (error) { notify(error.message || '操作失败，请重试'); }
  };
  let mounted = false, firstActivation = true;
  function show() { page.active = true; page.destroyed = false; page.onShow?.(); }
  function hide() { if (!page.active) return; page.active = false; page.onHide?.(); }
  onMounted(() => { mounted = true; page.onLoad?.(query); show(); nextTick(() => page.onReady?.()); });
  onActivated(() => { if (firstActivation) { firstActivation = false; return; } if (mounted) show(); });
  onDeactivated(hide);
  onBeforeUnmount(() => { hide(); page.onUnload?.(); page.destroyed = true; pages.delete(id); });
  watch(() => state.skin, skin => { page.data.skin = skin; });
  if (name === 'Schedule') watch(() => state.data, () => { if (page.active) { page.setData({ layout: state.data.settings.layoutMode }); page.render(); } });
  if (name === 'TabBar') watch(() => ui.tab, () => page.update?.());
  if (name === 'Sync') watch(() => [state.connection.room, state.connection.needsAuth, state.syncError, state.lastSync, state.consent], () => { if (page.active) page.update?.(); });
  if (name === 'Note') {
    watch(() => ui.compose, compose => { if (compose) page.openComposer(); else page.data.showEditor = false; });
    watch(() => state.messages.map(note => note.id).join(','), () => page.check?.());
    watch(() => [ui.tab, ui.stack.length], () => { if (!page.data.showEditor) page.check?.(true); });
    watch(() => [state.connection.room, state.connection.needsAuth, state.data.me], () => { page.check?.(); refreshMessages().catch(() => {}); });
  }
  return page;
}
