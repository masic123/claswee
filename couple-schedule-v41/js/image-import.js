/* 图片课表识别客户端：图片在浏览器压缩后直接发给已配置的 CloudBase 服务。 */
window.ScheduleImageImport = (function () {
  'use strict';
  const CLIENT_KEY = 'claswee_image_import_client_v1';
  const MAX_EDGE = 2048;
  const MAX_BYTES = 8 * 1024 * 1024;

  function clientId() {
    let value = localStorage.getItem(CLIENT_KEY);
    if (!value) {
      value = (window.crypto && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`).replace(/-/g, '');
      localStorage.setItem(CLIENT_KEY, value);
    }
    return value;
  }
  function endpoint() { return String(window.CLASWE_IMAGE_IMPORT_URL || '').trim(); }
  function readFile(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(new Error('图片读取失败')); };
      reader.readAsDataURL(file);
    });
  }
  function loadImage(url) {
    return new Promise(function (resolve, reject) {
      const image = new Image();
      image.onload = function () { resolve(image); };
      image.onerror = function () { reject(new Error('图片格式不支持')); };
      image.src = url;
    });
  }
  function compress(file) {
    if (!file || !/^image\/(jpeg|jpg|png|webp)$/i.test(file.type || '')) return Promise.reject(new Error('请选择 JPG、PNG 或 WEBP 图片'));
    if (file.size > 20 * 1024 * 1024) return Promise.reject(new Error('原图不能超过 20MB'));
    return readFile(file).then(loadImage).then(function (image) {
      const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      let quality = 0.85, result = canvas.toDataURL('image/jpeg', quality);
      while (result.length * 0.75 > MAX_BYTES && quality > 0.45) { quality -= 0.1; result = canvas.toDataURL('image/jpeg', quality); }
      if (result.length * 0.75 > MAX_BYTES) throw new Error('图片压缩后仍超过 8MB，请裁剪后重试');
      return result;
    });
  }
  function recognize(file, context) {
    const url = endpoint();
    if (!url) return Promise.reject(new Error('图片导入服务尚未配置'));
    return compress(file).then(function (imageData) {
      return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Claswee-Client': clientId() }, body: JSON.stringify(Object.assign({}, context, { imageData: imageData, clientId: clientId() })) });
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (payload) {
        if (!response.ok || !payload.ok) throw new Error(payload.message || '图片识别失败，请稍后重试');
        return payload;
      });
    });
  }
  return { recognize: recognize };
})();
