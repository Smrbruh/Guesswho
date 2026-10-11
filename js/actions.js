import {ROLL_MS, SUBTITLE} from './constants.js';
import {state} from './state.js';
import {catalog, photos} from './catalog.js';
import {savePhotos} from './storage.js';
import {dom} from './dom.js';
import {setImg} from './images.js';
import {play} from './motion.js';
import {addToast, clearToast} from './toast.js';
import {deckImgs} from './home.js';
import {board, buildGrid, hideSecret, render, revealSecret} from './board.js';
const show = (name) => {
  dom.home.hidden = name !== 'home';
  dom.game.hidden = name !== 'game';
  play(dom[name], [{opacity: 0, transform: 'translateY(14px) scale(.99)'}, {opacity: 1, transform: 'none'}], 420);
  scrollTo(0, 0);
};
export const openCat = (index) => {
  const cat = catalog[index];
  state.cat = index;
  state.closed.clear();
  state.secret = null;
  state.picking = false;
  state.photoMode = false;
  state.pending = null;
  dom.edition.textContent = cat.edition + SUBTITLE;
  buildGrid(cat);
  hideSecret();
  dom.hint.dataset.k = '';
  dom.win.textContent = '';
  dom.win.hidden = true;
  render();
  show('game');
};
export const goHome = () => {
  clearToast();
  state.cat = null;
  show('home');
};
export const setSecret = (i) => {
  state.secret = i;
  state.picking = false;
  state.closed.clear();
  revealSecret();
  render();
  addToast('ПЕРСОНАЖ ЗАГАДАН');
  play(dom.portrait, [{transform: 'scale(.9)', opacity: 0.4}, {transform: 'none', opacity: 1}], 420);
};
export const toggleClosed = (i) => {
  if (state.closed.has(i)) state.closed.delete(i);
  else state.closed.add(i);
  render();
};
export const resetClosed = () => {
  state.closed.clear();
  render();
  addToast('КАРТОЧКИ ПОДНЯТЫ');
};
export const togglePicking = () => {
  state.picking = !state.picking;
  if (state.picking) state.photoMode = false;
  render();
};
export const togglePhotoMode = () => {
  state.photoMode = !state.photoMode;
  state.pending = null;
  if (state.photoMode) state.picking = false;
  render();
};
export const toggleSecret = () => {
  if (state.secret === null) return;
  if (dom.secret.classList.contains('shown')) {
    hideSecret();
    addToast('ПЕРСОНАЖ СКРЫТ');
  } else {
    revealSecret();
    addToast('ПЕРСОНАЖ ОТКРЫТ');
  }
};
export const rollSecret = () => {
  if (dom.die.classList.contains('roll')) return;
  dom.die.classList.add('roll');
  setTimeout(() => {
    dom.die.classList.remove('roll');
    if (state.cat !== null) setSecret(Math.floor(Math.random() * catalog[state.cat].characters.length));
  }, ROLL_MS);
};
export const applyPhoto = (i, data) => {
  const c = catalog[state.cat].characters[i];
  c.img = data;
  photos[c.name] = data;
  savePhotos(photos);
  setImg(board.imgs[i], c);
  const mini = deckImgs[state.cat][i];
  if (mini) setImg(mini, c);
  render();
  addToast('ФОТО СОХРАНЕНО');
};
