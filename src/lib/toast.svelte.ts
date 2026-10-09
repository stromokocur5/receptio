/**
 * Short messages at the bottom of the screen, with an "undo" for things that can be put back.
 * Deleting goes ahead at once and offers undo, instead of asking "Naozaj?" first.
 */

export interface Toast {
	id: number;
	text: string;
	undo?: () => void;
}

export const toasts = $state<Toast[]>([]);
let next = 1;
const SHOWN_MS = 6000;

export function toast(text: string, undo?: () => void) {
	const id = next++;
	// One at a time: a new message replaces the old one (its undo is no longer offered).
	toasts.splice(0, toasts.length, { id, text, undo });
	setTimeout(() => dismiss(id), undo ? SHOWN_MS : 3500);
}

export function dismiss(id: number) {
	const i = toasts.findIndex((t) => t.id === id);
	if (i >= 0) toasts.splice(i, 1);
}

/** Runs `change`, then offers to put `value` back where it was. */
export function withUndo<T>(text: string, box: { current: T }, change: () => void) {
	const before = box.current;
	change();
	toast(text, () => (box.current = before));
}
