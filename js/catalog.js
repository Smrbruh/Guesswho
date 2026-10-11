import {DATA_URL} from './constants.js';
import {loadPhotos} from './storage.js';
export const photos = loadPhotos();
export const catalog = [];
export const loadCatalog = async () => {
  const res = await fetch(DATA_URL);
  if (!res.ok) throw new Error(String(res.status));
  const data = await res.json();
  data.categories.forEach((cat) => {
    cat.characters.forEach((c) => {
      if (typeof photos[c.name] === 'string') c.img = photos[c.name];
    });
    catalog.push(cat);
  });
};
