import {EASE} from './constants.js';
export const reduce = matchMedia('(prefers-reduced-motion: reduce)');
export const play = (el, frames, ms) => el.animate(
  reduce.matches ? frames.map((f) => ({opacity: f.opacity})) : frames,
  {duration: ms, easing: EASE},
);
