import { describe, expect, it } from 'vitest';
import {
	fits,
	freeDish,
	plateName,
	plateStyles,
	surprise,
	verifiedDish,
	type Candidate
} from './builder';
import { buildFromParams, buildToParams, defaultChoice, type Dish, type Part } from './dish';

const part = (id: string, kind: Part['kind'], style: Part['style'] = []): Part => ({
	id,
	name: id[0].toUpperCase() + id.slice(1),
	kind,
	style,
	servings: 2,
	methods: [],
	early: false,
	tips: []
});

const tofu = part('tofu', 'bielkovina');
const kari = part('kari', 'hlavne', ['indicke']);
const ryza = part('ryza', 'priloha', ['azijske', 'indicke']);
const knedla = part('knedla', 'priloha', ['domace']);
const teriyaki = part('teriyaki', 'omacka', ['azijske']);
const kasa = part('kasa', 'hlavne', ['sladke']);
const parts = [tofu, kari, ryza, knedla, teriyaki, kasa];
const byId = new Map(parts.map((p) => [p.id, p]));

describe('freeDish', () => {
	const dish = freeDish(parts);

	it('starts empty and keeps every part of a kind in its slot', () => {
		expect(Object.values(defaultChoice(dish))).toEqual([null, null, null, null]);
		expect(dish.slots.find((s) => s.id === 'hlavne')!.options).toEqual(['kari', 'kasa', 'tofu']);
	});

	it('writes only what was picked into the URL', () => {
		const build = { servings: 2, choice: { ...defaultChoice(dish), hlavne: 'tofu' }, methods: {} };
		const params = buildToParams(dish, build);
		expect(params.toString()).toBe('hlavne=tofu');
		expect(buildFromParams(dish, params, byId).choice).toEqual(build.choice);
	});
});

describe('styles', () => {
	it('suggests what the picked parts share', () => {
		expect([...plateStyles([ryza, kari])]).toEqual(['indicke']);
		expect(plateStyles([tofu]).size).toBe(0);
	});

	it('lets plain parts go with anything, but sweet only with sweet', () => {
		expect(fits(tofu, new Set(['azijske']))).toBe(true);
		expect(fits(knedla, new Set(['azijske']))).toBe(false);
		expect(fits(kasa, new Set(['indicke']))).toBe(false);
		expect(fits(kasa, new Set())).toBe(true);
	});
});

describe('verifiedDish', () => {
	const misa: Dish = {
		id: 'misa',
		name: 'Misa',
		description: '',
		meals: ['obed'],
		servings: 2,
		slots: [
			{ id: 'b', label: 'B', options: ['tofu'], optional: false },
			{ id: 'z', label: 'Z', options: ['ryza'], optional: false },
			{ id: 'o', label: 'O', options: ['teriyaki'], optional: true }
		],
		finish: [],
		tips: []
	};

	it('recognises a plate a curated dish can make', () => {
		expect(verifiedDish([tofu, ryza], [misa])?.id).toBe('misa');
		expect(verifiedDish([tofu, ryza, teriyaki], [misa])?.id).toBe('misa');
	});

	it('not when something is missing or extra', () => {
		expect(verifiedDish([tofu], [misa])).toBeUndefined();
		expect(verifiedDish([tofu, knedla], [misa])).toBeUndefined();
	});
});

describe('surprise', () => {
	const c = (p: Part, missing = 0): Candidate => ({ part: p, missing, cookable: true });

	it('builds a plate that hangs together', () => {
		const choice = surprise(
			{
				hlavne: [c(kari)],
				zaklad: [c(knedla), c(ryza)],
				zelenina: [],
				omacka: [c(teriyaki)]
			},
			() => 0.9
		);
		expect(choice).toEqual({ hlavne: 'kari', zaklad: 'ryza', zelenina: null, omacka: null });
	});

	it('names a plate from its parts', () => {
		expect(plateName([tofu, ryza])).toBe('Tofu · ryza');
	});
});
