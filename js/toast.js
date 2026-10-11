import {TOAST_MS} from './constants.js';
import {state} from './state.js';
import {dom} from './dom.js';
let timer = 0;
const paint = () => {
  if (state.toast) dom.toast.textContent = state.toast.text;
  dom.toast.classList.toggle('on', Boolean(state.toast));
};
export const clearToast = () => {
  clearTimeout(timer);
  state.toast = null;
  paint();
};
export const addToast = (text) => {
  clearTimeout(timer);
  state.toast = {text};
  timer = setTimeout(clearToast, TOAST_MS);
  paint();
};
