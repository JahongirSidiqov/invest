import { describe, expect, it } from 'vitest';
import en from './locales/en.json';
import ru from './locales/ru.json';
import uz from './locales/uz.json';

function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null
      ? keys(value, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

describe('locale packs', () => {
  const ruKeys = keys(ru).sort();

  it.each([
    ['uz', uz],
    ['en', en],
  ])('%s has exactly the same keys as ru', (_name, pack) => {
    expect(keys(pack).sort()).toEqual(ruKeys);
  });

  it('uses the Uzbek okina (ʻ U+02BB), not an apostrophe, in uz', () => {
    const values = JSON.stringify(uz);
    expect(values).not.toMatch(/[oOgG]['’`]/);
  });
});
