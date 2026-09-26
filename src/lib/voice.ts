import { normalizeSearch } from './labels';

export type VoiceCommand = 'next' | 'prev' | 'repeat' | 'timer' | 'ingredients' | 'stop';

const COMMANDS: [VoiceCommand, RegExp][] = [
	['next', /\b(dalej|dalsi|dalsie|pokracuj|hotovo)\b/],
	['prev', /\b(spat|naspat|predchadzajuci|predosly|vrat)\b/],
	['repeat', /\b(zopakuj|opakuj|znova|este raz|precitaj)\b/],
	['timer', /\b(casovac|stopky|spusti|minutka)\b/],
	['ingredients', /\b(suroviny|ingrediencie|co treba)\b/],
	['stop', /\b(stop|koniec|vypni|prestan)\b/]
];

/** Maps what the recognizer heard ("Ďalej prosím") to a cooking-mode command. */
export function parseCommand(transcript: string): VoiceCommand | null {
	const text = normalizeSearch(transcript);
	return COMMANDS.find(([, re]) => re.test(text))?.[0] ?? null;
}

type Recognition = {
	lang: string;
	continuous: boolean;
	interimResults: boolean;
	onresult:
		| ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>>; resultIndex: number }) => void)
		| null;
	onend: (() => void) | null;
	onerror: ((e: { error: string }) => void) | null;
	start(): void;
	stop(): void;
};

export function recognitionSupported(): boolean {
	return (
		typeof window !== 'undefined' &&
		('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
	);
}

export function speechSupported(): boolean {
	return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** A Slovak voice if the device has one (Czech as a close second), else the default. */
export function slovakVoice(): SpeechSynthesisVoice | null {
	const voices = speechSynthesis.getVoices();
	return (
		voices.find((v) => v.lang.toLowerCase().startsWith('sk')) ??
		voices.find((v) => v.lang.toLowerCase().startsWith('cs')) ??
		null
	);
}

export function speak(text: string, onEnd?: () => void) {
	if (!speechSupported()) return;
	speechSynthesis.cancel();
	const u = new SpeechSynthesisUtterance(text);
	const voice = slovakVoice();
	u.lang = voice?.lang ?? 'sk-SK';
	if (voice) u.voice = voice;
	u.rate = 0.95;
	u.onend = () => onEnd?.();
	u.onerror = () => onEnd?.();
	speechSynthesis.speak(u);
}

/**
 * Listens for commands until stopped. Browsers end a session after a silence, so it restarts
 * itself; `pause`/`resume` keep it from hearing its own voice while reading a step.
 */
export function createListener(
	onCommand: (c: VoiceCommand) => void,
	onFatal: (reason: string) => void
) {
	const Ctor =
		(window as unknown as Record<string, new () => Recognition>).SpeechRecognition ??
		(window as unknown as Record<string, new () => Recognition>).webkitSpeechRecognition;
	const rec = new Ctor();
	rec.lang = 'sk-SK';
	rec.continuous = true;
	rec.interimResults = false;
	let active = false;
	let paused = false;

	rec.onresult = (e) => {
		for (let i = e.resultIndex; i < e.results.length; i++) {
			const command = parseCommand(e.results[i][0].transcript);
			if (command) onCommand(command);
		}
	};
	rec.onend = () => {
		if (active && !paused) {
			try {
				rec.start();
			} catch {
				// Already restarting.
			}
		}
	};
	rec.onerror = (e) => {
		if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
			active = false;
			onFatal('Mikrofón nie je povolený.');
		}
	};

	return {
		start() {
			active = true;
			paused = false;
			rec.start();
		},
		stop() {
			active = false;
			rec.stop();
		},
		pause() {
			paused = true;
			rec.stop();
		},
		resume() {
			if (!active) return;
			paused = false;
			try {
				rec.start();
			} catch {
				// Still running.
			}
		}
	};
}
