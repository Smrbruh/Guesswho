import {SPRITE} from './constants.js';
import {catalog} from './catalog.js';
import {dom} from './dom.js';
import {setImg} from './images.js';
export const deckImgs = [];
const plural = (n) => {
  const a = n % 10;
  const b = n % 100;
  if (a === 1 && b !== 11) return 'ПЕРСОНАЖ';
  return a > 1 && a < 5 && (b < 12 || b > 14) ? 'ПЕРСОНАЖА' : 'ПЕРСОНАЖЕЙ';
};
export const buildDecks = () => {
  const frag = document.createDocumentFragment();
  catalog.forEach((cat, i) => {
    const b = document.createElement('button');
    b.className = 'deck';
    b.type = 'button';
    b.dataset.c = i;
    b.style.setProperty('--h', cat.hue);
    b.innerHTML = `<span class="fan"><img class="mini m0" alt="" decoding="async" loading="lazy"><img class="mini m1" alt="" decoding="async" loading="lazy"><img class="mini m2" alt="" decoding="async" loading="lazy"></span><span class="dt">${cat.title}</span><span class="micro">${cat.characters.length} ${plural(cat.characters.length)}</span><span class="go">ИГРАТЬ<svg class="ico" aria-hidden="true"><use href="${SPRITE}#i-go"/></svg></span>`;
    const list = [...b.querySelectorAll('img')];
    list.forEach((img, k) => setImg(img, cat.characters[k]));
    deckImgs.push(list);
    frag.appendChild(b);
  });
  dom.decks.replaceChildren(frag);
};
