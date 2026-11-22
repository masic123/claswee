const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Store = require('../miniprogram/utils/store');
const UI = require('./fixtures/ui-mocks');

function setup(wxOverrides = {}) {
  let data = Store.defaults(), page, saves = 0;
  const toasts = [];
  const wx = {
    setNavigationBarTitle() {}, showLoading() {}, hideLoading() {},
    showToast: options => toasts.push(options),
    ...wxOverrides
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../miniprogram/pages/settings/index.js'), 'utf8'), {
    require: name => name.endsWith('/store') ? { ...Store, get: () => structuredClone(data), save: value => { data = structuredClone(value); saves++; } } : name.endsWith('/skin') ? UI.skin : name.endsWith('/notifications') ? UI.notifications : {},
    Page: value => { page = value; }, wx, console:{ warn() {} }
  });
  page.data = structuredClone(page.data);
  page.setData = values => Object.assign(page.data, values);
  page.load();
  return { page, toasts, get data() { return data; }, get saves() { return saves; } };
}

test('selected WeChat avatar is compressed, saved, and immediately displayed without cloud upload', async () => {
  const compressed = [];
  const s = setup({
    compressImage: options => { compressed.push(options); options.success({ tempFilePath:'wxfile://compressed-avatar.jpg' }); },
    getFileSystemManager: () => ({ readFile: options => options.success({ data:'/9j/' + 'A'.repeat(3000) }) }),
    cloud: { uploadFile() { throw new Error('old cloud upload must not run'); } }
  });
  await s.page.onChooseAvatar({ detail:{ avatarUrl:'wxfile://wechat-avatar.png' } });
  assert.equal(compressed[0].src, 'wxfile://wechat-avatar.png');
  assert.equal(s.saves, 1);
  assert.ok(s.data.users.cat.avatar.startsWith('data:image/jpeg;base64,/9j/'));
  assert.equal(s.page.data.wechatAvatarIsImage, true);
  assert.equal(s.page.data.avatarSaving, false);
  assert.equal(s.toasts.at(-1).title, '头像已保存');
});

test('album selection retains its target owner while the media picker is open', async () => {
  let choose;
  const s = setup({
    chooseMedia: options => { choose = options; },
    compressImage: options => options.success({ tempFilePath:'wxfile://album-compressed.jpg' }),
    getFileSystemManager: () => ({ readFile: options => options.success({ data:'iVBOR' + 'A'.repeat(3500) }) })
  });
  s.page.avatar({ currentTarget:{ dataset:{ owner:'dog' } } });
  s.page.uploadAvatar();
  assert.deepEqual(Array.from(choose.sourceType), ['album']);
  s.page.data.avatarTarget = 'cat';
  choose.success({ tempFiles:[{ tempFilePath:'wxfile://album.png' }] });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(s.saves, 1);
  assert.ok(s.data.users.dog.avatar.startsWith('data:image/png;base64,iVBOR'));
  assert.equal(s.data.users.cat.avatar, '🐱');
  assert.equal(s.page.data.emojiSheet, false);
});

test('top avatar gives feedback and its album fallback saves to the current identity', async () => {
  let choose;
  const s = setup({
    chooseMedia: options => { choose = options; },
    compressImage: options => options.success({ tempFilePath:'wxfile://top-compressed.jpg' }),
    getFileSystemManager: () => ({ readFile: options => options.success({ data:'/9j/' + 'A'.repeat(3500) }) })
  });
  s.page.chooseMe({ currentTarget:{ dataset:{ owner:'dog' } } });
  s.page.onWechatAvatarTap();
  assert.match(s.page.data.avatarHelp, /从相册选择头像/);
  s.page.uploadAvatar({ currentTarget:{ dataset:{ owner:'dog' } } });
  assert.deepEqual(Array.from(choose.sourceType), ['album']);
  choose.success({ tempFiles:[{ tempFilePath:'wxfile://top-album.png' }] });
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(s.data.users.dog.avatar.startsWith('data:image/jpeg;base64,/9j/'));
  assert.equal(s.data.users.cat.avatar, '🐱');
  assert.equal(s.page.data.avatarHelp, '');
});

test('an image that stays too large does not replace the saved avatar', async () => {
  let attempts = 0;
  const s = setup({
    compressImage: options => { attempts++; options.success({ tempFilePath:`wxfile://attempt-${attempts}.png` }); },
    getFileSystemManager: () => ({ readFile: options => options.success({ data:'iVBOR' + 'A'.repeat(25000) }) })
  });
  await s.page.onChooseAvatar({ detail:{ avatarUrl:'wxfile://large.png' } });
  assert.equal(attempts, 3);
  assert.equal(s.saves, 0);
  assert.equal(s.data.users.cat.avatar, '🐱');
  assert.equal(s.page.data.avatarSaving, false);
  assert.equal(s.toasts.at(-1).title, '头像过大，请换张图片');
});

test('compression failure reports the problem without changing the avatar', async () => {
  const s = setup({
    compressImage: options => options.fail({ errMsg:'compressImage:fail' }),
    getFileSystemManager: () => ({ readFile: options => options.success({ data:'iVBOR' + 'A'.repeat(25000) }) })
  });
  await s.page.onChooseAvatar({ detail:{ avatarUrl:'wxfile://large.png' } });
  assert.equal(s.saves, 0);
  assert.equal(s.toasts.at(-1).title, '头像压缩失败，请换张图片');
});
