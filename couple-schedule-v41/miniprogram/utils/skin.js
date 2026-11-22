// 皮肤只保存在本机，不进入共享课表或同步文件。
const STORAGE_KEY = 'claswee.skin';
const THEMES = {
  blush: { name: '心动粉蓝', navigation: '#fff6fa', textStyle: 'black' },
  mint: { name: '海盐薄荷', navigation: '#e4f3ea', textStyle: 'black' },
  sun: { name: '日光奶油', navigation: '#fceac3', textStyle: 'black' },
  night: { name: '午夜星图', navigation: '#1a2946', textStyle: 'white' }
};

function normalize(value) { return Object.prototype.hasOwnProperty.call(THEMES, value) ? value : 'blush'; }
function get() {
  try { return normalize(wx.getStorageSync(STORAGE_KEY)); }
  catch (_) { return 'blush'; }
}
function set(value) {
  const skin = normalize(value);
  try { wx.setStorageSync(STORAGE_KEY, skin); } catch (_) { /* 无存储权限时本次访问仍可换肤 */ }
  return skin;
}
function applyNavigation(skin) {
  const theme = THEMES[normalize(skin)];
  if (typeof wx.setNavigationBarColor === 'function') {
    wx.setNavigationBarColor({ frontColor: theme.textStyle === 'white' ? '#ffffff' : '#000000', backgroundColor: theme.navigation, animation: { duration: 0, timingFunc: 'linear' } });
  }
  if (typeof wx.setBackgroundColor === 'function') wx.setBackgroundColor({ backgroundColor: theme.navigation });
}
function apply(page, tabIndex) {
  const skin = get();
  page.setData({ skin });
  const tabBar = page.getTabBar && page.getTabBar();
  if (tabBar) tabBar.setData(Number.isInteger(tabIndex) ? { selected: tabIndex, skin } : { skin });
  applyNavigation(skin);
  return skin;
}

module.exports = { THEMES, normalize, get, set, applyNavigation, apply };
