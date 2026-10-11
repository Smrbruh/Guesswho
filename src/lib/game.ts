import type { Character } from '../types';
export function toggleCard(closed: string[], id: string) { return closed.includes(id) ? closed.filter(item => item !== id) : [...closed, id]; }
export function checkGuess(secret: string, guess: string) { return secret === guess; }
export function randomCharacter(characters: Character[]) { return characters[crypto.getRandomValues(new Uint32Array(1))[0] % characters.length]; }
export const questions = [
  { key: 'male', ru: 'Это мужчина?', en: 'Is your character male?' },
  { key: 'female', ru: 'Это женщина?', en: 'Is your character female?' },
  { key: 'dark', ru: 'У персонажа тёмные волосы?', en: 'Does your character have dark hair?' },
  { key: 'light', ru: 'У персонажа светлые волосы?', en: 'Does your character have light hair?' },
  { key: 'glasses', ru: 'Персонаж носит очки?', en: 'Does your character wear glasses?' },
];
export const shopItems = [
  { id: 'frame-lime', type: 'frame', ru: 'Кислотный неон', en: 'Acid neon', price: 150, color: '#d7fa62', rarity: 'rare' },
  { id: 'frame-violet', type: 'frame', ru: 'Космическая пыль', en: 'Cosmic dust', price: 250, color: '#b399ff', rarity: 'epic' },
  { id: 'frame-gold', type: 'frame', ru: 'Чемпион', en: 'Champion', price: 500, color: '#f6c563', rarity: 'legendary' },
  { id: 'frame-aurora', type: 'frame', ru: 'Северное сияние', en: 'Aurora', price: 400, color: '#67e8d4', rarity: 'epic' },
  { id: 'frame-rose', type: 'frame', ru: 'Розовый кварц', en: 'Rose quartz', price: 350, color: '#f9a8d4', rarity: 'epic' },
  { id: 'frame-inferno', type: 'frame', ru: 'Инферно', en: 'Inferno', price: 650, color: '#ff8a55', rarity: 'legendary' },
  { id: 'emoji-love', type: 'emoji', ru: 'От всего сердца', en: 'All the love', price: 160, color: '#f9a8d4', emoji: '🥰', rarity: 'epic' },
  { id: 'emoji-mindblown', type: 'emoji', ru: 'Взрыв мозга', en: 'Mind blown', price: 180, color: '#ffb67b', emoji: '🤯', rarity: 'epic' },
  { id: 'emoji-party', type: 'emoji', ru: 'Это праздник!', en: 'Party time', price: 180, color: '#d7fa62', emoji: '🥳', rarity: 'epic' },
  { id: 'emoji-melt', type: 'emoji', ru: 'Я всё…', en: 'I am melting', price: 140, color: '#ffd273', emoji: '🫠', rarity: 'rare' },
  { id: 'emoji-shock', type: 'emoji', ru: 'Как ты узнал?!', en: 'How did you know?!', price: 140, color: '#8ddaff', emoji: '😱', rarity: 'rare' },
  { id: 'emoji-spy', type: 'emoji', ru: 'Под прикрытием', en: 'Undercover', price: 200, color: '#c2a3ff', emoji: '🥸', rarity: 'epic' },
  { id: 'emoji-fire', type: 'emoji', ru: 'На огне', en: 'On fire', price: 100, color: '#f5986e', emoji: '🔥', rarity: 'rare' },
  { id: 'emoji-brain', type: 'emoji', ru: 'Большой мозг', en: 'Big brain', price: 100, color: '#f6a0c4', emoji: '🧠', rarity: 'rare' },
  { id: 'emoji-crown', type: 'emoji', ru: 'Королевский ход', en: 'Royal move', price: 200, color: '#f6c563', emoji: '👑', rarity: 'epic' },
  { id: 'emoji-devil', type: 'emoji', ru: 'Хитрый план', en: 'Evil plan', price: 150, color: '#dcb87c', emoji: '😈', rarity: 'epic' },
  { id: 'emoji-clown', type: 'emoji', ru: 'Цирк уехал', en: 'Clown show', price: 150, color: '#dcb87c', emoji: '🤡', rarity: 'epic' },
  { id: 'emoji-skull', type: 'emoji', ru: 'Умер со смеху', en: 'Dead laughing', price: 150, color: '#dcb87c', emoji: '💀', rarity: 'epic' },
  { id: 'emoji-yawn', type: 'emoji', ru: 'Я уже засыпаю', en: 'Still waiting', price: 100, color: '#dcb87c', emoji: '🥱', rarity: 'rare' },
  { id: 'emoji-salt', type: 'emoji', ru: 'Слишком солёно', en: 'Extra salty', price: 100, color: '#dcb87c', emoji: '🧂', rarity: 'rare' },
  { id: 'emoji-ez', type: 'emoji', ru: 'Без шансов', en: 'Too easy', price: 250, color: '#dcb87c', emoji: 'GG EZ', rarity: 'epic' },
  { id: 'emoji-rage', type: 'emoji', ru: 'Подгорело', en: 'Tilted', price: 120, color: '#dcb87c', emoji: '😤', rarity: 'rare' },
  { id: 'emoji-ice', type: 'emoji', ru: 'Холодный расчёт', en: 'Ice cold', price: 120, color: '#dcb87c', emoji: '🥶', rarity: 'rare' },
  { id: 'emoji-goat', type: 'emoji', ru: 'Легенда', en: 'The GOAT', price: 200, color: '#dcb87c', emoji: '🐐', rarity: 'epic' },
  { id: 'emoji-sus', type: 'emoji', ru: 'Подозрительно', en: 'Sus', price: 100, color: '#dcb87c', emoji: '🤨', rarity: 'rare' },
  { id: 'emoji-cry', type: 'emoji', ru: 'Ну не плачь', en: 'There there', price: 100, color: '#dcb87c', emoji: '🥲', rarity: 'rare' },
  { id: 'emoji-cook', type: 'emoji', ru: 'Дай приготовить', en: 'Let me cook', price: 150, color: '#dcb87c', emoji: '🧑‍🍳', rarity: 'epic' },
  { id: 'emoji-popcorn', type: 'emoji', ru: 'Смотрю шоу', en: 'Enjoying the show', price: 100, color: '#dcb87c', emoji: '🍿', rarity: 'rare' },
  { id: 'emoji-nerd', type: 'emoji', ru: 'Вообще-то…', en: 'Actually…', price: 100, color: '#dcb87c', emoji: '🤓', rarity: 'rare' },
  { id: 'emoji-smirk', type: 'emoji', ru: 'Я всё знаю', en: 'I know', price: 100, color: '#dcb87c', emoji: '😏', rarity: 'rare' },
  { id: 'emoji-bye', type: 'emoji', ru: 'До свидания', en: 'Bye bye', price: 100, color: '#dcb87c', emoji: '👋', rarity: 'rare' },
];
