import { ALL_PERSISTED, ASIDE, keptAside, type AsideParts } from './state.svelte';

const APP = 'receptio';
const VERSION = 1;
/** A real backup is a few kB; anything this big isn't ours. */
export const MAX_BACKUP_BYTES = 1_000_000;

type StoreName = keyof typeof ALL_PERSISTED;

export function exportBackup(now = new Date()): string {
	// In a household the own plan, list and pantry are the ones kept aside, not the household's.
	const data = {
		...Object.fromEntries(
			Object.entries(ALL_PERSISTED).map(([name, store]) => [name, store.current])
		),
		...keptAside.read()
	};
	return JSON.stringify(
		{ app: APP, version: VERSION, exportedAt: now.toISOString(), data },
		null,
		1
	);
}

export function backupFileName(now = new Date()): string {
	return `receptio-zaloha-${now.toISOString().slice(0, 10)}.json`;
}

/**
 * Restores every part of a backup that validates; the rest keeps its current value.
 * Returns the restored parts, or null when the file isn't a Receptio backup at all.
 */
export function importBackup(text: string): StoreName[] | null {
	if (text.length > MAX_BACKUP_BYTES) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return null;
	}
	if (typeof parsed !== 'object' || parsed === null) return null;
	const { app, version, data } = parsed as Record<string, unknown>;
	if (app !== APP || version !== VERSION || typeof data !== 'object' || data === null) return null;

	const parts = data as Record<string, unknown>;
	// Backups made while there could be only one garden keep it under `garden`.
	if (!('gardens' in parts) && 'garden' in parts) {
		parts.gardens = parts.garden === null ? [] : [parts.garden];
	}

	const restored: StoreName[] = [];
	const aside: Partial<AsideParts> = {};
	for (const name of ASIDE) {
		const value = name in parts ? ALL_PERSISTED[name].parse(parts[name]) : undefined;
		if (value !== undefined) (aside as Record<string, unknown>)[name] = value;
	}
	if (keptAside.write(aside)) {
		restored.push(...(Object.keys(aside) as StoreName[]));
		for (const name of ASIDE) delete parts[name];
	}
	for (const [name, store] of Object.entries(ALL_PERSISTED) as [
		StoreName,
		(typeof ALL_PERSISTED)[StoreName]
	][]) {
		if (name in parts && store.restore(parts[name])) restored.push(name);
	}
	return restored;
}
