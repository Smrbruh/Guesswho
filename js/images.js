import {GLYPHS} from './constants.js';
const hueOf = (text) => {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
};
export const placeholder = (name) => {
  const h = hueOf(name);
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 288"><defs><radialGradient id="g" cx=".5" cy=".35" r=".85"><stop offset="0" stop-color="hsl(${h},55%,42%)"/><stop offset="1" stop-color="#140a04"/></radialGradient></defs><rect width="240" height="288" fill="url(#g)"/><g transform="translate(60 84) scale(5)" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width=".6" stroke-linejoin="round"><path d="${GLYPHS[h % 4]}"/></g><text x="120" y="172" text-anchor="middle" font-family="Segoe UI,Arial,sans-serif" font-size="64" font-weight="800" fill="#fff">${initials}</text></svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
};
export const setImg = (img, character) => {
  const src = character.img || placeholder(character.name);
  img.dataset.n = character.name;
  if (img.dataset.s !== src) {
    img.dataset.s = src;
    delete img.dataset.fb;
    img.src = src;
  }
};
export const installImageFallback = () => {
  document.addEventListener('error', (e) => {
    const t = e.target;
    if (t.tagName === 'IMG' && t.dataset.n && !t.dataset.fb) {
      t.dataset.fb = '1';
      t.src = placeholder(t.dataset.n);
    }
  }, true);
};
