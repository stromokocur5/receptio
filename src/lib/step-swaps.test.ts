import { describe, expect, it } from 'vitest';
import { rewriteStep } from './step-swaps';

describe('rewriteStep', () => {
	it('swaps onion and garlic in their cases', () => {
		expect(
			rewriteStep('Na oleji speň cibuľu, pridaj cesnak a s cesnakom minútu praž.', [
				'cibula',
				'cesnak'
			])
		).toBe(
			'Na oleji speň zelenú cibuľku, pridaj cesnakový olej a s cesnakovým olejom minútu praž.'
		);
	});

	it('drops what only fits the old ingredient', () => {
		expect(rewriteStep('Prelisovaný cesnak vmiešaj do omáčky.', ['cesnak'])).toBe(
			'Cesnakový olej vmiešaj do omáčky.'
		);
		expect(rewriteStep('Pridaj 2 strúčiky cesnaku.', ['cesnak'])).toBe('Pridaj cesnakový olej.');
		expect(rewriteStep('Opeč so strúčikom cesnaku.', ['cesnak'])).toBe('Opeč s cesnakovým olejom.');
		expect(rewriteStep('Nakrájaj červenú cibuľu.', ['cibula-cervena'])).toBe(
			'Nakrájaj zelenú cibuľku.'
		);
	});

	it('turns spring onion into its green part without doubling words', () => {
		expect(rewriteStep('Posyp jarnou cibuľkou.', ['jarna-cibulka'])).toBe(
			'Posyp zelenou cibuľkou.'
		);
	});

	it('leaves adjectives and untouched ingredients alone', () => {
		expect(rewriteStep('Podávaj s cesnakovým dipom a cibuľou.', ['cesnak'])).toBe(
			'Podávaj s cesnakovým dipom a cibuľou.'
		);
	});

	it('swaps soy milk, yogurt, mushrooms and cream', () => {
		expect(
			rewriteStep('Zalej sójovým mliekom, pridaj šampiňóny a vmiešaj smotanu.', [
				'sojove-mlieko',
				'sampinony',
				'rastlinna-smotana'
			])
		).toBe('Zalej ryžovým nápojom, pridaj hlivu a vmiešaj kokosové mlieko.');
		expect(rewriteStep('Dip zo sójového jogurtu.', ['sojovy-jogurt'])).toBe(
			'Dip z kokosového jogurtu.'
		);
		expect(rewriteStep('Opeč so šampiňónmi.', ['sampinony'])).toBe('Opeč s hlivou.');
	});

	it('cooks green tops for a minute and warms garlic oil instead of frying garlic', () => {
		expect(
			rewriteStep('Na oleji speň cibuľu 8 minút dozlatista, potom opraž cesnak.', [
				'cibula',
				'cesnak'
			])
		).toBe('Na oleji speň zelenú cibuľku 1 minútu, potom zohrej cesnakový olej.');
		expect(rewriteStep('Cibuľu a papriku speň 5 minút.', ['cibula'])).toBe(
			'Zelenú cibuľku a papriku speň 5 minút.'
		);
		expect(rewriteStep('Tofu s cibuľou opeč.', ['cibula'])).toBe('Tofu so zelenou cibuľkou opeč.');
		expect(rewriteStep('Do šťavy prelisuj cesnak.', ['cesnak'])).toBe(
			'Do šťavy pridaj cesnakový olej.'
		);
	});

	it('handles the rest of what recipes say about garlic and onion', () => {
		const both = ['cibula', 'cesnak', 'jarna-cibulka'];
		expect(rewriteStep('Pridaj 2 prelisované strúčiky cesnaku.', both)).toBe(
			'Pridaj cesnakový olej.'
		);
		expect(rewriteStep('Potri rozpoleným cesnakom.', both)).toBe('Potri cesnakovým olejom.');
		expect(rewriteStep('Bylinky nasekaj, cesnak pretlač.', both)).toBe(
			'Bylinky nasekaj, cesnakový olej pridaj.'
		);
		expect(rewriteStep('Na oleji speň cibule, polovicu cibule odlož.', both)).toBe(
			'Na oleji speň zelenú cibuľku, polovicu zelenej cibuľky odlož.'
		);
		expect(rewriteStep('Zohrej cesnak a biele časti jarnej cibuľky.', both)).toBe(
			'Zohrej cesnakový olej a zelenú cibuľku.'
		);
		expect(rewriteStep('Mrkvu a cibuľu nakrájaj a opekaj 10 minút.', both)).toBe(
			'Mrkvu a zelenú cibuľku nakrájaj a opekaj 10 minút.'
		);
	});
});
