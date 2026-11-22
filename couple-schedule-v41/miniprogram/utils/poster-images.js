let serial = 0;
function isImage(source) { return /^(data:|cloud:\/\/|https?:\/\/|wxfile:\/\/|\/)/.test(String(source || '')); }
function load(node, source, errorText) {
  return new Promise((resolve, reject) => {
    const image = node.createImage();
    const timer = setTimeout(() => { image.onload = image.onerror = null; reject(new Error(errorText)); }, 10000);
    image.onload = () => { clearTimeout(timer); image.onload = image.onerror = null; resolve(image); };
    image.onerror = () => { clearTimeout(timer); image.onload = image.onerror = null; reject(new Error(errorText)); };
    image.src = source;
  });
}
async function avatar(node, source, temporaryFiles) {
  if (!isImage(source)) return null;
  const inline = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=\s]+)$/i.exec(source);
  if (inline) {
    const extension = /^jpe?g$/i.test(inline[1]) ? 'jpg' : inline[1].toLowerCase();
    const filePath = `${wx.env.USER_DATA_PATH}/claswee-poster-${Date.now()}-${++serial}.${extension}`;
    temporaryFiles.push(filePath);
    await new Promise((resolve, reject) => wx.getFileSystemManager().writeFile({ filePath, data: inline[2], encoding: 'base64', success: resolve, fail: () => reject(new Error('头像图片读取失败，请重试')) }));
    source = filePath;
  } else if (/^data:/i.test(source)) {
    throw new Error('头像格式无法读取，请在设置中重新选择头像');
  } else if (/^cloud:\/\//.test(source)) {
    if (!wx.cloud || !wx.cloud.downloadFile) throw new Error('头像加载失败，请在设置中重新选择头像');
    source = await new Promise((resolve, reject) => wx.cloud.downloadFile({ fileID: source, success: result => resolve(result.tempFilePath), fail: () => reject(new Error('头像加载失败，请重试')) }));
  }
  return load(node, source, '头像加载失败，请重试或在设置中重新选择头像');
}
function release(temporaryFiles) {
  temporaryFiles.forEach(filePath => wx.getFileSystemManager().unlink({ filePath, success() {}, fail() {} }));
}
module.exports = { load, avatar, release };
