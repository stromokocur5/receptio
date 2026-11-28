import { describe, expect, it } from 'vitest';
import {
	inLearnedOrder,
	NO_STORE_ORDER,
	noteTick,
	orderAisles,
	settleTrip,
	type StoreOrder
} from './store-order';

const MIN = 60_000;

/** Ticks `ids` (id:category) one minute apart in `store`, then lets the trip end. */
function shop(order: StoreOrder, ids: string[], store = '', start = 0): StoreOrder {
	ids.forEach((x, i) => {
		const [id, category] = x.split(':');
		order = noteTick(order, store, id, category, true, start + i * MIN);
	});
	return settleTrip(order, start + 10 * 60 * MIN);
}

const aisles = (order: StoreOrder, store = '') =>
	orderAisles(
		[
			['zelenina', [{ ingredient: { id: 'mrkva' } }, { ingredient: { id: 'cibula' } }]],
			['strukoviny', [{ ingredient: { id: 'cicer' } }]],
			['koreniny', [{ ingredient: { id: 'kmin' } }]]
		],
		order,
		store
	).map(([c, list]) => `${c}(${list.map((i) => i.ingredient.id).join(',')})`);

describe('the shop order', () => {
	it('keeps the usual order before any trip', () => {
		expect(aisles(NO_STORE_ORDER)).toEqual([
			'zelenina(mrkva,cibula)',
			'strukoviny(cicer)',
			'koreniny(kmin)'
		]);
	});

	it('follows the order things were ticked in the shop', () => {
		const order = shop(NO_STORE_ORDER, [
			'kmin:koreniny',
			'cicer:strukoviny',
			'cibula:zelenina',
			'mrkva:zelenina'
		]);
		expect(order.trips['']).toBe(1);
		expect(aisles(order)).toEqual([
			'koreniny(kmin)',
			'strukoviny(cicer)',
			'zelenina(cibula,mrkva)'
		]);
	});

	it('learns nothing from ticking everything at home in a few seconds', () => {
		let order = NO_STORE_ORDER;
		for (const [i, id] of ['kmin', 'cicer', 'cibula', 'mrkva'].entries()) {
			order = noteTick(order, '', id, id === 'kmin' ? 'koreniny' : 'x', true, i * 1000);
		}
		order = settleTrip(order, 0, true);
		expect(order.trips['']).toBeUndefined();
		expect(order.trip).toBeNull();
	});

	it('forgets an untick and keeps each shop apart', () => {
		let order = noteTick(NO_STORE_ORDER, 'lidl', 'kmin', 'koreniny', true, 0);
		order = noteTick(order, 'lidl', 'kmin', 'koreniny', false, MIN);
		expect(order.trip?.ticks).toEqual([]);
		order = shop(
			NO_STORE_ORDER,
			['kmin:koreniny', 'cicer:strukoviny', 'cibula:zelenina', 'mrkva:zelenina'],
			'lidl'
		);
		expect(aisles(order, 'kaufland')[0]).toBe('zelenina(mrkva,cibula)');
		expect(aisles(order, 'lidl')[0]).toBe('koreniny(kmin)');
	});

	it('a tick long after the last one starts a new trip and learns the old one', () => {
		let order = NO_STORE_ORDER;
		['kmin:koreniny', 'cicer:strukoviny', 'cibula:zelenina', 'mrkva:zelenina'].forEach((x, i) => {
			const [id, c] = x.split(':');
			order = noteTick(order, '', id, c, true, i * MIN);
		});
		order = noteTick(order, '', 'mrkva', 'zelenina', true, 5 * 60 * MIN);
		expect(order.trips['']).toBe(1);
		expect(order.trip?.ticks.map(([id]) => id)).toEqual(['mrkva']);
	});

	it('a rearranged shop is relearned within a few trips', () => {
		let order = NO_STORE_ORDER;
		for (let t = 0; t < 5; t++) order = shop(order, ['a:x', 'b:x', 'c:x', 'd:x'], '', t * 1e9);
		for (let t = 5; t < 9; t++) order = shop(order, ['d:x', 'c:x', 'b:x', 'a:x'], '', t * 1e9);
		const list = ['a', 'b', 'c', 'd'];
		expect(inLearnedOrder(list, (x) => x, order.pairs[''])).toEqual(['d', 'c', 'b', 'a']);
	});
});
