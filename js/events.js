import {state} from './state.js';
import {dom} from './dom.js';
import {reduce} from './motion.js';
import {cropToJpeg} from './photo.js';
import {applyPhoto, goHome, openCat, resetClosed, rollSecret, setSecret, toggleClosed, togglePhotoMode, togglePicking, toggleSecret} from './actions.js';
let hovered = null;
const untilt = () => {
  if (!hovered) return;
  hovered.style.removeProperty('--rx');
  hovered.style.removeProperty('--ry');
  hovered = null;
};
const onGridClick = (e) => {
  const card = e.target.closest('.card');
  if (!card) return;
  const i = Number(card.dataset.i);
  if (state.photoMode) {
    state.pending = i;
    dom.file.click();
  } else if (state.picking) {
    setSecret(i);
  } else {
    toggleClosed(i);
  }
};
const onGridMove = (e) => {
  if (e.pointerType !== 'mouse' || reduce.matches) return;
  const card = e.target.closest('.card');
  if (card !== hovered) untilt();
  if (!card) return;
  hovered = card;
  const r = card.getBoundingClientRect();
  card.style.setProperty('--ry', ((e.clientX - r.left) / r.width - 0.5) * 6 + 'deg');
  card.style.setProperty('--rx', (0.5 - (e.clientY - r.top) / r.height) * 6 + 'deg');
};
const onFile = async () => {
  const file = dom.file.files[0];
  const index = state.pending;
  const cat = state.cat;
  dom.file.value = '';
  state.pending = null;
  if (!file || index === null || cat === null) return;
  try {
    const data = await cropToJpeg(file);
    if (state.cat === cat) applyPhoto(index, data);
  } catch {
    return;
  }
};
export const bindEvents = () => {
  dom.decks.addEventListener('click', (e) => {
    const deck = e.target.closest('.deck');
    if (deck) openCat(Number(deck.dataset.c));
  });
  dom.grid.addEventListener('click', onGridClick);
  dom.grid.addEventListener('pointermove', onGridMove);
  dom.grid.addEventListener('pointerleave', untilt);
  dom.menu.addEventListener('click', goHome);
  dom.pick.addEventListener('click', togglePicking);
  dom.photo.addEventListener('click', togglePhotoMode);
  dom.reset.addEventListener('click', resetClosed);
  dom.roll.addEventListener('click', rollSecret);
  dom.peek.addEventListener('click', toggleSecret);
  dom.portrait.addEventListener('click', toggleSecret);
  dom.file.addEventListener('change', onFile);
};
