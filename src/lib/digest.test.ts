import { describe, expect, it } from 'vitest';
import { morningDigest, weeklyDigest } from './digest';

describe('digests', () => {
	it('sums up the week with the budget', () => {
		const text = weeklyDigest({
			cooked: 5,
			cost: 12.4,
			plants: 22,
			plantGoal: 30,
			proteinPerDay: 48,
			proteinGoal: 65,
			spent: 41,
			budget: 35
		});
		expect(text.body).toContain('Uvarené 5×');
		expect(text.body).toContain('22 z 30 rastlín');
		expect(text.body).toMatch(/nad rozpočtom o 6,00\s€/);
	});

	it('says nothing in the morning when there is nothing to say', () => {
		expect(morningDigest({ meals: [], thaw: [], useSoon: [], sales: [] })).toBeNull();
		const day = morningDigest({
			meals: ['Obed: Dal (uvariť)'],
			thaw: ['Chili'],
			useSoon: [],
			sales: ['mrkva (Lidl)']
		});
		expect(day?.title).toBe('Dnes 1 jedlo z plánu');
		expect(day?.body.split('\n')).toEqual([
			'Obed: Dal (uvariť)',
			'Vyber z mrazničky na zajtra: Chili',
			'V akcii z plánu: mrkva (Lidl)'
		]);
	});

	it('with nothing planned, food about to spoil is the news and the tap finds a recipe', () => {
		const day = morningDigest({
			meals: [],
			thaw: [],
			useSoon: ['špenát', 'tofu'],
			useSoonIds: ['spenat', 'tofu-natural'],
			cookIt: 'Tofu so špenátom',
			sales: []
		});
		expect(day?.title).toBe('Minie sa špenát a ďalšie');
		expect(day?.body).toBe('Minie sa: špenát, tofu – čo tak Tofu so špenátom?');
		expect(day?.url).toBe('/zvysky?s=spenat,tofu-natural');
	});
});

describe('weekly sales', () => {
	it('adds what the user buys that is on sale, for planning the next week', () => {
		const text = weeklyDigest({
			cooked: 2,
			cost: 5,
			plants: 10,
			plantGoal: 30,
			proteinPerDay: 50,
			proteinGoal: 65,
			spent: null,
			budget: null,
			sales: ['tofu −30 % (Lidl)']
		});
		expect(text.body.split('\n')[1]).toBe('V akcii z toho, čo kupuješ: tofu −30 % (Lidl)');
	});
});
