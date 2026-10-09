/**
 * With Receptio open in several tabs, only one of them syncs (the household and the recovery
 * code): two would send the same changes twice and, sharing one phone's id, overwrite each
 * other's pantry changes. It's the tab in front – the one being used; a tab that goes to the
 * background sends what's pending and hands over. The others save to storage like always, and
 * the syncing tab hears about it (`storage` events) and sends it on.
 */

export const tab = $state({ syncs: false });

type Hook = () => void | Promise<void>;
const starts: Hook[] = [];
const stops: Hook[] = [];

/** Runs when this tab starts syncing (also at once if it already does). */
export function onSyncStart(hook: Hook) {
	starts.push(hook);
	if (tab.syncs) void hook();
}

/** Runs before this tab stops syncing; it may send what's pending first. */
export function onSyncStop(hook: Hook) {
	stops.push(hook);
}

let release: (() => void) | null = null;
let pending: AbortController | null = null;

function want() {
	const locks = navigator.locks;
	// Without Web Locks (old browsers) every tab syncs while in front, as before.
	if (!locks) {
		start();
		return;
	}
	if (tab.syncs || pending) return;
	const abort = new AbortController();
	pending = abort;
	locks
		.request('receptio:sync', { signal: abort.signal }, () => {
			pending = null;
			start();
			return new Promise<void>((resolve) => (release = resolve));
		})
		.catch(() => {
			// Aborted while waiting: this tab went to the background first.
			if (pending === abort) pending = null;
		});
}

function start() {
	tab.syncs = true;
	for (const hook of starts) void hook();
}

async function handOver() {
	pending?.abort();
	pending = null;
	if (!tab.syncs) return;
	if (!navigator.locks) {
		await Promise.all(stops.map((hook) => hook()));
		return;
	}
	try {
		await Promise.all(stops.map((hook) => hook()));
	} finally {
		tab.syncs = false;
		release?.();
		release = null;
	}
}

/** Once, from the root layout. */
export function initTabs() {
	if (document.visibilityState === 'visible') want();
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible') want();
		else void handOver();
	});
}
