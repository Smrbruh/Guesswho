import { describe, test, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import catalog from '../src/data/catalog.json';
import { toggleCard, checkGuess } from '../src/lib/game';
describe('playable catalog', () => {
  test('has seven complete packs with unique bilingual characters and local WebP portraits', () => {
    expect(catalog).toHaveLength(7);
    const ids = catalog.flatMap(c => c.characters.map(ch => ch.id));
    expect(new Set(ids).size).toBe(272);
    for (const deck of catalog) {
      expect(deck.characters).toHaveLength(['walking-dead','jojo','avatar-aang'].includes(deck.id) ? 48 : 32);
      for (const c of deck.characters) {
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
