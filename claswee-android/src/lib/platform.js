import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export const native = Capacitor.isNativePlatform();
const Vault = registerPlugin('SecureVault');
const ImageFiles = registerPlugin('ImageFiles');
const PREFIX = 'claswee.android.';
export const storage = {
  async get(key, fallback = null) {
    const result = await Preferences.get({ key: PREFIX + key });
    if (result.value === null) return fallback;
    try { return JSON.parse(result.value); } catch { throw new Error('本机数据无法读取，请先导出备份并联系开发者'); }
  },
  async set(key, value) { await Preferences.set({ key: PREFIX + key, value: JSON.stringify(value) }); },
};
export const secureStorage = {
  async get() {
    if (native) { const result = await Vault.get(); return result.value ? JSON.parse(result.value) : null; }
    return storage.get('development-connection');
  },
  async set(value) {
    if (native) await Vault.set({ value: JSON.stringify(value) });
    else await storage.set('development-connection', value);
  },
};
export async function http(url, body, timeout = 20000, header = {}) {
  let response;
  try {
    if (native) {
      const result = await CapacitorHttp.request({ url, method: 'POST', headers: { 'Content-Type': 'application/json', ...header }, data: body, connectTimeout: timeout, readTimeout: timeout, responseType: 'json' });
      response = { status: result.status, data: typeof result.data === 'string' ? JSON.parse(result.data) : result.data };
    } else {
      const result = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...header }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout) });
      response = { status: result.status, data: await result.json() };
    }
  } catch { throw Object.assign(new Error('连接暂时不可用，数据已保存在本机。请检查网络后重试'), { code: 'NETWORK_ERROR' }); }
  if (response.status < 200 || response.status >= 300 || !response.data?.ok) {
    throw Object.assign(new Error(response.data?.message || '服务暂时不可用，请稍后重试'), { code: response.data?.code || 'SERVER_ERROR', status: response.status });
  }
  return response.data;
}
export async function exportFile(name, value, title = '分享课表备份') {
  if (native) {
    const file = await Filesystem.writeFile({ path: name, data: typeof value === 'string' ? value : JSON.stringify(value, null, 2), directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title, url: file.uri, dialogTitle: title });
  } else {
    const blob = new Blob([typeof value === 'string' ? value : JSON.stringify(value, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
export async function shareText(text) {
  if (native) return Share.share({ title: '一起用 claswee', text, dialogTitle: '邀请对方加入房间' });
  if (navigator.share) return navigator.share({ title: '一起用 claswee', text });
  await navigator.clipboard.writeText(text);
}
export async function exportImage(name, dataUrl, share = true) {
  const data = dataUrl.split(',')[1];
  if (native) {
    if (!share) return ImageFiles.save({ name, data });
    const file = await Filesystem.writeFile({ path: name, data, directory: Directory.Cache });
    await Share.share({ title: 'claswee 周课表', url: file.uri, dialogTitle: '分享课表图片' });
  } else {
    const link = document.createElement('a'); link.download = name; link.href = dataUrl; link.click();
  }
}
