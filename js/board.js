import {HINTS, SPRITE, SYMBOLS} from './constants.js';
import {state} from './state.js';
import {catalog} from './catalog.js';
import {dom} from './dom.js';
import {setImg} from './images.js';
import {play} from './motion.js';
export const board = {cards: [], imgs: []};
export const buildGrid = (cat) => {
  const frag = document.createDocumentFragment();
  board.cards = cat.characters.map((c, i) => {
    const b = document.createElement('button');
    b.className = 'card';
    b.type = 'button';
    b.dataset.i = i;
    b.setAttribute('aria-label', c.name);
    b.setAttribute('aria-pressed', 'false');
    b.style.setProperty('--d', (i * 90) % 640 + 'ms');
    b.innerHTML = `<span class="flip"><span class="face front"><span class="pic"><img alt="" decoding="async" loading="lazy"></span><span class="name"><span class="nm">${c.name}</span></span></span><span class="face back"><svg class="ico glyph" aria-hidden="true"><use href="${SPRITE}#${SYMBOLS[i % 4]}"/></svg><span class="micro">ЗАКРЫТО</span></span></span>`;
    setImg(b.querySelector('img'), c);
    frag.appendChild(b);
    return b;
  });
  board.imgs = board.cards.map((b) => b.querySelector('img'));
  dom.grid.replaceChildren(frag);
};
export const revealSecret = () => {
  dom.secret.classList.add('shown');
  dom.peek.setAttribute('aria-pressed', 'true');
  dom.peekL.textContent = 'СКРЫТЬ';
};
export const hideSecret = () => {
  dom.secret.classList.remove('shown');
  dom.peek.setAttribute('aria-pressed', 'false');
  dom.peekL.textContent = 'ПОКАЗАТЬ';
};
export const render = () => {
  if (state.cat === null) return;
  const list = catalog[state.cat].characters;
  const total = list.length;
  const left = total - state.closed.size;
  const last = !state.picking && left === 1 ? board.cards.findIndex((_, i) => !state.closed.has(i)) : -1;
  board.cards.forEach((b, i) => {
    const closed = state.closed.has(i);
    b.classList.toggle('closed', closed);
    b.classList.toggle('last', i === last);
    b.setAttribute('aria-pressed', String(closed));
  });
  dom.grid.classList.toggle('picking', state.picking);
  const key = state.photoMode ? 'photo' : state.picking ? 'pick' : left === 0 ? 'all' : left === 1 ? 'one' : state.secret === null ? 'none' : 'play';
  if (dom.hint.dataset.k !== key) {
    dom.hint.dataset.k = key;
    dom.hint.textContent = HINTS[key];
    play(dom.hint, [{opacity: 0, transform: 'translateY(6px)'}, {opacity: 1, transform: 'none'}], 260);
  }
  const verdict = last >= 0 ? 'ЭТО — ' + list[last].name.toUpperCase() : '';
  if (dom.win.textContent !== verdict) {
    dom.win.textContent = verdict;
    dom.win.hidden = !verdict;
    if (verdict) play(dom.win, [{opacity: 0, transform: 'scale(.9)'}, {opacity: 1, transform: 'scale(1.05)'}, {opacity: 1, transform: 'scale(1)'}], 560);
  }
  dom.count.textContent = left;
  dom.dial.style.setProperty('--p', left / total);
  const has = state.secret !== null;
  dom.secret.classList.toggle('has', has);
  dom.peek.disabled = !has;
  if (has) {
    setImg(dom.sImg, list[state.secret]);
    dom.sName.textContent = list[state.secret].name;
  }
  dom.pick.setAttribute('aria-pressed', String(state.picking));
  dom.photo.setAttribute('aria-pressed', String(state.photoMode));
};
