import { describe, expect, it } from 'vitest';
import { parseCommand } from './voice';

describe('parseCommand', () => {
	it('understands common Slovak commands, with or without diacritics', () => {
		expect(parseCommand('Ďalej')).toBe('next');
		expect(parseCommand('ďalší krok prosím')).toBe('next');
		expect(parseCommand('späť')).toBe('prev');
		expect(parseCommand('zopakuj to')).toBe('repeat');
		expect(parseCommand('spusti časovač')).toBe('timer');
		expect(parseCommand('aké suroviny')).toBe('ingredients');
		expect(parseCommand('stop')).toBe('stop');
	});

	it('ignores unrelated speech', () => {
		expect(parseCommand('toto je fakt dobré')).toBeNull();
	});
});
