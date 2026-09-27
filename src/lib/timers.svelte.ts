import { browser } from '$app/environment';

export interface KitchenTimer {
	id: string;
	/** "Krémový hummus · 2 minúty" */
	label: string;
	recipeId: string;
	seconds: number;
	/** Epoch ms; counting from a deadline keeps timers right after the tab was asleep. */
	endsAt: number;
}

const STORAGE_KEY = 'receptio:timers';
const RING_EVERY_MS = 1500;

export const kitchen = $state<{ timers: KitchenTimer[]; now: number; ringing: string[] }>({
	timers: [],
	now: Date.now(),
	ringing: []
});

let ticker: ReturnType<typeof setInterval> | undefined;
let ringer: ReturnType<typeof setInterval> | undefined;
let audio: AudioContext | undefined;
const notified = new Set<string>();

function save() {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(kitchen.timers));
	} catch {
		// Timers still run for this session.
	}
}

function isTimer(t: unknown): t is KitchenTimer {
	if (typeof t !== 'object' || t === null) return false;
	const v = t as Record<string, unknown>;
	return (
		typeof v.id === 'string' &&
		typeof v.label === 'string' &&
		typeof v.recipeId === 'string' &&
		typeof v.seconds === 'number' &&
		typeof v.endsAt === 'number'
	);
}

/** Restores timers after a reload; called once from the root layout. */
export function loadTimers() {
	try {
		const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
		// Anything that finished over an hour ago was forgotten, not left ringing on purpose.
		const cutoff = Date.now() - 60 * 60 * 1000;
		kitchen.timers = Array.isArray(raw) ? raw.filter(isTimer).filter((t) => t.endsAt > cutoff) : [];
	} catch {
		kitchen.timers = [];
	}
	sync();
}

export function remaining(timer: KitchenTimer): number {
	return (timer.endsAt - kitchen.now) / 1000;
}

/** Browsers only allow sound after a user gesture, so unlock audio when a timer is started. */
function unlockAudio() {
	try {
		audio ??= new AudioContext();
		if (audio.state === 'suspended') void audio.resume();
	} catch {
		audio = undefined;
	}
}

function beep() {
	if (!audio) return;
	const t = audio.currentTime;
	for (const [offset, freq] of [
		[0, 880],
		[0.22, 1175],
		[0.44, 880]
	]) {
		const osc = audio.createOscillator();
		const gain = audio.createGain();
		osc.frequency.value = freq;
		osc.type = 'sine';
		gain.gain.setValueAtTime(0.0001, t + offset);
		gain.gain.exponentialRampToValueAtTime(0.35, t + offset + 0.02);
		gain.gain.exponentialRampToValueAtTime(0.0001, t + offset + 0.18);
		osc.connect(gain).connect(audio.destination);
		osc.start(t + offset);
		osc.stop(t + offset + 0.2);
	}
}

async function notify(timer: KitchenTimer) {
	if (notified.has(timer.id) || !('Notification' in window)) return;
	notified.add(timer.id);
	if (Notification.permission !== 'granted') return;
	try {
		// Android only shows notifications through the service worker.
		const registration = await navigator.serviceWorker?.getRegistration();
		const options = {
			body: timer.label,
			tag: timer.id,
			icon: '/icon-192.png',
			requireInteraction: true
		};
		if (registration) await registration.showNotification('Čas vypršal ⏰', options);
		else new Notification('Čas vypršal ⏰', options);
	} catch {
		// Sound and the on-page alert still work.
	}
}

function tick() {
	kitchen.now = Date.now();
	const due = kitchen.timers.filter((t) => t.endsAt <= kitchen.now).map((t) => t.id);
	const fresh = due.filter((id) => !kitchen.ringing.includes(id));
	if (fresh.length) {
		kitchen.ringing = [...kitchen.ringing, ...fresh];
		navigator.vibrate?.([300, 150, 300, 150, 300]);
		for (const id of fresh) void notify(kitchen.timers.find((t) => t.id === id)!);
	}
	sync();
}

/** Runs the clock only while something is counting down or ringing. */
function sync() {
	if (!browser) return;
	if (kitchen.timers.length && !ticker) ticker = setInterval(tick, 250);
	if (!kitchen.timers.length && ticker) {
		clearInterval(ticker);
		ticker = undefined;
	}
	if (kitchen.ringing.length && !ringer) {
		beep();
		ringer = setInterval(beep, RING_EVERY_MS);
	}
	if (!kitchen.ringing.length && ringer) {
		clearInterval(ringer);
		ringer = undefined;
	}
}

export function startTimer(label: string, recipeId: string, seconds: number) {
	unlockAudio();
	if ('Notification' in window && Notification.permission === 'default') {
		void Notification.requestPermission();
	}
	kitchen.now = Date.now();
	kitchen.timers = [
		...kitchen.timers,
		{ id: crypto.randomUUID(), label, recipeId, seconds, endsAt: kitchen.now + seconds * 1000 }
	];
	save();
	sync();
}

/** Adds (or with a negative value takes away) time; a running timer never ends in the past. */
export function addTime(id: string, seconds: number) {
	const now = Date.now();
	kitchen.timers = kitchen.timers.map((t) =>
		t.id === id ? { ...t, endsAt: Math.max(Math.max(t.endsAt, now) + seconds * 1000, now) } : t
	);
	kitchen.ringing = kitchen.ringing.filter((r) => r !== id);
	notified.delete(id);
	save();
	sync();
}

export function stopTimer(id: string) {
	kitchen.timers = kitchen.timers.filter((t) => t.id !== id);
	kitchen.ringing = kitchen.ringing.filter((r) => r !== id);
	notified.delete(id);
	save();
	sync();
}
