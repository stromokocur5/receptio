import { error, json } from '@sveltejs/kit';
import {
	MAX_BODY_BYTES,
	MAX_SUGGESTIONS_PER_DAY,
	saveSuggestion,
	suggestionSchema,
	suggestionsToday
} from '$lib/server/suggestions';
import { verifyTurnstile } from '$lib/server/turnstile';
import type { RequestHandler } from './$types';

export const prerender = false;

export const POST: RequestHandler = async ({ request, platform, getClientAddress }) => {
	const env = platform?.env;
	if (!env?.DB) error(503, 'Návrhy teraz nefungujú');

	const limit = await env.SUGGEST_LIMITER?.limit({ key: getClientAddress() });
	if (limit && !limit.success) error(429, 'Chvíľu počkaj a skús to znova');

	if (!request.headers.get('content-type')?.startsWith('application/json')) {
		error(415, 'Neplatná požiadavka');
	}
	const body = await request.text();
	if (body.length > MAX_BODY_BYTES) error(413, 'Návrh je príliš dlhý');

	let raw: unknown;
	try {
		raw = JSON.parse(body);
	} catch {
		error(400, 'Neplatná požiadavka');
	}
	const parsed = suggestionSchema.safeParse(raw);
	if (!parsed.success) error(400, 'Skontroluj, či je vyplnený názov, suroviny aj postup');

	// Pretend success to bots so they don't retry.
	if (parsed.data.website) return json({ ok: true });

	const human = await verifyTurnstile({
		secret: env.TURNSTILE_SECRET,
		hostnames: env.TURNSTILE_HOSTNAMES,
		action: 'suggest',
		token: parsed.data.turnstile,
		remoteip: getClientAddress()
	});
	if (!human) error(403, 'Overenie, že nie si robot, zlyhalo. Skús to znova.');

	let saved = false;
	try {
		if ((await suggestionsToday(env.DB)) < MAX_SUGGESTIONS_PER_DAY) {
			await saveSuggestion(env.DB, parsed.data);
			saved = true;
		}
	} catch (err) {
		console.error('suggestions: save failed', err);
		error(500, 'Návrh sa nepodarilo uložiť');
	}
	if (!saved) error(429, 'Dnes už prišlo veľa návrhov, skús to zajtra');
	return json({ ok: true }, { status: 201 });
};
