import { canonical } from './member-keys';

/**
 * Three-way merge of two devices' data against the copy both last agreed on (`base`): what
 * only one side changed is taken from it, what both changed merges deeper, and where both set
 * a different value, `local` wins. Deletions count as changes, so something removed on one
 * device doesn't come back from the other.
 *
 * Objects merge key by key; arrays whose items all carry an `id` merge item by item; other
 * arrays are bags of values: an item stays unless one side removed it, and items either side
 * added are all kept (local order first).
 */
export function merge3(base: unknown, local: unknown, remote: unknown): unknown {
	const b = canonical(base);
	const l = canonical(local);
	const r = canonical(remote);
	if (l === r || r === b) return local;
	if (l === b) return remote;
	if (isPlain(local) && isPlain(remote)) {
		return mergeObjects(isPlain(base) ? base : {}, local, remote);
	}
	if (Array.isArray(local) && Array.isArray(remote)) {
		const was = Array.isArray(base) ? base : [];
		return withIds(local) && withIds(remote) && withIds(was)
			? mergeById(was, local, remote)
			: mergeBags(was, local, remote);
	}
	return local;
}

const isPlain = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

const withIds = (items: unknown[]): items is { id: string }[] =>
	items.every((x) => isPlain(x) && typeof x.id === 'string');

/** A key missing on one side was deleted there (or never there); `undefined` stands for missing. */
function mergeObjects(
	base: Record<string, unknown>,
	local: Record<string, unknown>,
	remote: Record<string, unknown>
) {
	const out: Record<string, unknown> = {};
	for (const key of new Set([...Object.keys(local), ...Object.keys(remote)])) {
		const value = mergeValue(
			base[key],
			local[key],
			remote[key],
			key in base,
			key in local,
			key in remote
		);
		if (value !== MISSING) out[key] = value;
	}
	return out;
}

const MISSING = Symbol('missing');

function mergeValue(
	base: unknown,
	local: unknown,
	remote: unknown,
	inBase: boolean,
	inLocal: boolean,
	inRemote: boolean
): unknown {
	const b = inBase ? canonical(base) : null;
	const l = inLocal ? canonical(local) : null;
	const r = inRemote ? canonical(remote) : null;
	if (l === r) return inLocal ? local : MISSING;
	if (r === b) return inLocal ? local : MISSING;
	if (l === b) return inRemote ? remote : MISSING;
	// Changed on both sides; a deletion against an edit keeps the edit.
	if (!inLocal) return remote;
	if (!inRemote) return local;
	return merge3(inBase ? base : undefined, local, remote);
}

function mergeById(base: { id: string }[], local: { id: string }[], remote: { id: string }[]) {
	const was = new Map(base.map((x) => [x.id, x]));
	const theirs = new Map(remote.map((x) => [x.id, x]));
	const mine = new Set(local.map((x) => x.id));
	const out: unknown[] = [];
	for (const item of local) {
		const value = mergeValue(
			was.get(item.id),
			item,
			theirs.get(item.id),
			was.has(item.id),
			true,
			theirs.has(item.id)
		);
		if (value !== MISSING) out.push(value);
	}
	for (const item of remote) {
		if (mine.has(item.id)) continue;
		// Only there: new on the other device, or deleted here (then it was in base, unchanged).
		const value = mergeValue(was.get(item.id), undefined, item, was.has(item.id), false, true);
		if (value !== MISSING) out.push(value);
	}
	return out;
}

/** Items as values: removed where one side dropped one, added where either added one. */
function mergeBags(base: unknown[], local: unknown[], remote: unknown[]) {
	const count = (items: unknown[]) => {
		const counts = new Map<string, number>();
		for (const x of items) counts.set(canonical(x), (counts.get(canonical(x)) ?? 0) + 1);
		return counts;
	};
	const b = count(base);
	const r = count(remote);
	const l = count(local);
	const out: unknown[] = [];
	const used = new Map<string, number>();
	const want = (key: string) => {
		const nb = b.get(key) ?? 0;
		const nl = l.get(key) ?? 0;
		const nr = r.get(key) ?? 0;
		// Kept: as many as both still have of the base's; plus what each side added.
		return Math.min(nb, nl, nr) + Math.max(0, nl - nb) + Math.max(0, nr - nb);
	};
	for (const item of [...local, ...remote]) {
		const key = canonical(item);
		const n = used.get(key) ?? 0;
		if (n >= want(key)) continue;
		used.set(key, n + 1);
		out.push(item);
	}
	return out;
}
