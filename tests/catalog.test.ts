import { describe, test, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import catalog from '../src/data/catalog.json';
import { toggleCard, checkGuess, questionsForDeck } from '../src/lib/game';
describe('playable catalog', () => {
  test('has fifteen complete packs with unique bilingual cards and local WebP images', () => {
    expect(catalog).toHaveLength(15);
    const ids = catalog.flatMap(c => c.characters.map(ch => ch.id));
    expect(new Set(ids).size).toBe(656);
    for (const deck of catalog) {
      expect(deck.characters).toHaveLength(['attack-on-titan','naruto','harry-potter','avengers'].includes(deck.id) ? 32 : 48);
      const keys = questionsForDeck(deck).map(question => question.key);
      expect(new Set(keys).size).toBe(keys.length);
      for (const c of deck.characters) {
        expect(c.traits.every(trait => keys.includes(trait)), c.id).toBe(true);
        expect(c.name).toMatch(/[А-Яа-я]/);
        expect(c.nameEn).toMatch(/[a-zA-Z]/);
        const file = `public${c.img}`;
        expect(existsSync(file), c.id).toBe(true);
        const bytes = readFileSync(file);
        expect(bytes.subarray(8,12).toString(), c.id).toBe('WEBP');
        expect(bytes.length).toBeLessThan(100000);
      }
    }
  });
  test('elimination is reversible and guesses are exact', () => {
    expect(toggleCard(['a'],'b')).toEqual(['a','b']);
    expect(toggleCard(['a','b'],'a')).toEqual(['b']);
    expect(checkGuess('a','b')).toBe(false);
    expect(checkGuess('a','a')).toBe(true);
  });
});
