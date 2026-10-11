import {PHOTO_KEY} from './constants.js';
export const loadPhotos = () => {
  try {
    const value = JSON.parse(localStorage.getItem(PHOTO_KEY) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
};
export const savePhotos = (photos) => {
  try {
    localStorage.setItem(PHOTO_KEY, JSON.stringify(photos));
  } catch {
    return;
  }
};
