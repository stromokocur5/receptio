import { describe, expect, it } from 'vitest';
import {
	formatDuration,
	scaleStep,
	splitStep,
	stepActivity,
	stepGuides,
	stepLines
} from './cooking';
import type { Ingredient, RecipeLine } from './types';

const timers = (step: string) =>
	splitStep(step)
		.filter((s) => 'timer' in s)
		.map((s) => ('timer' in s ? [s.text, s.timer.seconds] : null));

describe('splitStep', () => {
	it('finds minutes, seconds, hours and ranges', () => {
		expect(timers('Opraž 30 sekúnd, potom duste 8–10 minút a nechaj 1 hodinu kysnúť.')).toEqual([
			['30 sekúnd', 30],
			['8–10 minút', 480],
			['1 hodinu', 3600]
		]);
		expect(timers('Po 10–15 minútach sa mlieko zrazí, pečieš 25 min.')).toEqual([
			['10–15 minútach', 600],
			['25 min', 1500]
		]);
		expect(timers('Nechaj odpočívať pol hodiny.')).toEqual([['pol hodiny', 1800]]);
	});

	it('skips waits too long to time on a phone and plain numbers', () => {
		expect(timers('Namoč na 12 hodín. Pridaj 2 minútky… a 3 PL oleja.')).toEqual([]);
	});

	it('keeps the whole text around the timers', () => {
		const step = 'Var 15 minút, kým nezmäkne.';
		expect(
			splitStep(step)
				.map((s) => s.text)
				.join('')
		).toBe(step);
	});
});

function ing(id: string, name: string): Ingredient {
	return { id, name } as Ingredient;
}
const line = (ingredientId: string): RecipeLine => ({
	ingredientId,
	grams: 100,
	amount: 100,
	unit: 'g'
});

describe('stepLines', () => {
	const byId = new Map(
		[
			ing('cicer', 'Cícer sterilizovaný'),
			ing('aquafaba', 'Aquafaba (voda z cíceru)'),
			ing('cibula', 'Cibuľa'),
			ing('jarna', 'Jarná cibuľka'),
			ing('olej', 'Olivový olej'),
			ing('kmin', 'Rasca rímska (kmín)'),
			ing('zrna', 'Sójové zrná')
		].map((i) => [i.id, i])
	);
	const lines = [...byId.keys()].map(line);
	const ids = (step: string) => stepLines(step, lines, byId).map((l) => l.ingredientId);

	it('matches inflected nouns, ignoring adjectives', () => {
		expect(ids('Na olivovom oleji opeč cibuľu.')).toEqual(['cibula', 'olej']);
	});

	it('prefers the most specific ingredient for a word', () => {
		expect(ids('Pridaj biele časti cibuľky.')).toEqual(['jarna']);
		expect(ids('Cícer ošúp.')).toEqual(['cicer']);
	});

	it('uses aliases in parentheses and all-adjective names', () => {
		expect(ids('Pridaj kmín a zrná namoč.')).toEqual(['kmin', 'zrna']);
	});
});

describe('formatDuration', () => {
	it('formats minutes and hours', () => {
		expect(formatDuration(65)).toBe('1:05');
		expect(formatDuration(3725)).toBe('1:02:05');
		expect(formatDuration(-3)).toBe('0:00');
	});
});

describe('stepGuides', () => {
	const rice = { ...ing('ryza', 'Ryža basmati'), howto: ['ryza'] } as Ingredient;
	const oil = { ...ing('olej', 'Olej'), howto: [] } as Ingredient;
	const byId = new Map([rice, oil].map((i) => [i.id, i]));
	const line = (ingredientId: string) => ({ ingredientId }) as RecipeLine;

	it('links guides of the ingredients a step uses, if the recipe lists them', () => {
		expect(stepGuides('Uvar ryžu.', [line('ryza')], byId, ['ryza'])).toEqual(['ryza']);
		expect(stepGuides('Uvar ryžu.', [line('ryza')], byId, [])).toEqual([]);
	});

	it('links technique guides by the words of the step', () => {
		expect(stepGuides('Vyprážaj v oleji na 175 °C.', [line('olej')], byId, [])).toEqual([
			'vyprazanie'
		]);
		expect(stepGuides('Na oleji speň cibuľu, potom duste 10 minút.', [], byId, [])).toEqual([
			'slovnik'
		]);
		expect(stepGuides('Peč na 200 °C 25 minút.', [], byId, [])).toEqual(['pecenie-zeleniny']);
		expect(stepGuides('Nechaj hodinu kysnúť.', [], byId, [])).toEqual(['kysnute-cesto']);
		expect(stepGuides('Premiešaj a podávaj.', [], byId, [])).toEqual([]);
	});
});

describe('scaleStep', () => {
	it('scales spoons, grams, liters and cups', () => {
		expect(scaleStep('Na 2 PL oleja speň cibuľu a zalej 500 ml vody.', 0.5)).toBe(
			'Na 1 PL oleja speň cibuľu a zalej 250 ml vody.'
		);
		expect(scaleStep('Pridaj ½ ČL soli a 1,5 l vývaru.', 2)).toBe('Pridaj 1 ČL soli a 3 l vývaru.');
		expect(scaleStep('Šošovicu var v 2 hrnčekoch vody, pridaj 1 hrnček ryže.', 2)).toBe(
			'Šošovicu var v 4 hrnčekoch vody, pridaj 2 hrnčeky ryže.'
		);
		expect(scaleStep('Var v 2 hrnčekoch vody.', 0.5)).toBe('Var v 1 hrnčeku vody.');
		expect(scaleStep('Pridaj 3 PL oleja.', 0.5)).toBe('Pridaj 1½ PL oleja.');
		expect(scaleStep('Pridaj 2–3 PL vody.', 2)).toBe('Pridaj 4–6 PL vody.');
	});

	it('leaves times, temperatures, sizes and counts alone', () => {
		const step =
			'Peč na 200 °C 25 minút, vytvaruj 8 guliek hrubých 2 cm a var s 1,5-násobkom vody.';
		expect(scaleStep(step, 2)).toBe(step);
		expect(scaleStep('Pridaj 2 PL oleja.', 1)).toBe('Pridaj 2 PL oleja.');
	});
});

describe('stepActivity', () => {
	it('picks what the step starts with', () => {
		expect(stepActivity('Cibuľu nakrájaj nadrobno.')).toBe('krajanie');
		expect(stepActivity('V panvici rozohrej olej a restuj cibuľu 5 minút.')).toBe('restovanie');
		expect(stepActivity('Peč pri 200 °C 20 minút.')).toBe('pecenie');
		expect(stepActivity('Všetko rozmixuj dohladka.')).toBe('mixovanie');
		expect(stepActivity('Prived do varu a varte 10 minút.')).toBe('varenie');
		expect(stepActivity('Nechaj hodinu stuhnúť v chladničke.')).toBe('chladenie');
		expect(stepActivity('Dochuť citrónom a podávaj.')).toBe('podavanie');
		expect(stepActivity('Niečo úplne iné.')).toBe('miesanie');
	});
});
