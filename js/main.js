import {dom} from './dom.js';
import {loadCatalog} from './catalog.js';
import {installImageFallback} from './images.js';
import {buildDecks} from './home.js';
import {bindEvents} from './events.js';
const start = async () => {
  installImageFallback();
  bindEvents();
  try {
    await loadCatalog();
  } catch {
    dom.notice.hidden = false;
    return;
  }
  buildDecks();
};
start();
