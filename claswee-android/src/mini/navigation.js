import { reactive } from 'vue';

export const ui = reactive({ tab: 'schedule', stack: [], title: 'claswee', toast: '', loading: '', dialog: null, legal: '', compose: false });
let toastTimer, navigationId = 0;
export const pages = new Map();
export const backHandlers = new Set();
export function notify(title) {
  ui.toast = title; clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { ui.toast = ''; }, 3000);
}
export function navigate(url) {
  const [pathname, query] = url.split('?');
  const id = { add: 'add', 'image-import': 'image-import', 'share-poster': 'share-poster', settings: 'settings', schedule: 'schedule', sync: 'sync' }[pathname.split('/')[2]];
  if (!id) throw new Error('页面不存在');
  ui.stack.push({ id, key: ++navigationId, query: Object.fromEntries(new URLSearchParams(query || '')) });
  window.scrollTo(0, 0);
}
export function switchTab(id) { ui.stack = []; ui.tab = id; window.scrollTo(0, 0); }
export function navigateBack() { if (ui.stack.length) ui.stack.pop(); window.scrollTo(0, 0); }
export function modal(options) {
  return new Promise(resolve => {
    ui.dialog = { ...options, resolve(result) { ui.dialog = null; options.success?.(result); resolve(result); } };
  });
}
export function handleBack() {
  if (ui.dialog) { ui.dialog.resolve({ confirm: false, cancel: true }); return true; }
  if (ui.legal) { ui.legal = ''; return true; }
  for (const handler of [...backHandlers].reverse()) if (handler()) return true;
  const page = [...pages.values()].find(page => page.active && !['Note', 'TabBar'].includes(page.name));
  if (page) {
    for (const key of ['emojiSheet', 'todayOpen', 'addMenuOpen', 'filterMenuOpen', 'layoutMenuOpen']) {
      if (page.data[key]) { page.data[key] = false; return true; }
    }
  }
  if (ui.stack.length) { navigateBack(); return true; }
  if (ui.tab !== 'schedule') { switchTab('schedule'); return true; }
  return false;
}
