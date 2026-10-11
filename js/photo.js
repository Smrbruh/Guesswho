import {PHOTO_H, PHOTO_QUALITY, PHOTO_W} from './constants.js';
export const cropToJpeg = (file) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.addEventListener('load', () => {
    const ratio = PHOTO_W / PHOTO_H;
    let sw = img.naturalWidth;
    let sh = img.naturalHeight;
    if (sw / sh > ratio) sw = sh * ratio;
    else sh = sw / ratio;
    const canvas = document.createElement('canvas');
    canvas.width = PHOTO_W;
    canvas.height = PHOTO_H;
    canvas.getContext('2d').drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 3, sw, sh, 0, 0, PHOTO_W, PHOTO_H);
    URL.revokeObjectURL(url);
    resolve(canvas.toDataURL('image/jpeg', PHOTO_QUALITY));
  });
  img.addEventListener('error', () => {
    URL.revokeObjectURL(url);
    reject(new Error('decode'));
  });
  img.src = url;
});
