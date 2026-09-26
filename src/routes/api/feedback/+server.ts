import { error, json } from '@sveltejs/kit';
import { getContent } from '$lib/server/content';
import {
	MAX_FEEDBACK_BYTES,
	MAX_FEEDBACK_PER_DAY,
	feedbackSchema,
	feedbackToday,
	saveFeedback
} from '$lib/server/feedback';
import { verifyTurnstile } from '$lib/server/turnstile';
import type { RequestHandler } from './$types';

export const prerender = false;

export const POST: RequestHandler = async ({ request, platform, getClientAddress }) => {
	const env = platform?.env;
	if (!env?.DB) error(503, 'Spätná väzba teraz nefunguje');

	const limit = await env.SUGGEST_LIMITER?.limit({ key: getClientAddress() });
	if (limit && !limit.success) error(429, 'Chvíľu počkaj a skús to znova');

	if (!request.headers.get('content-type')?.startsWith('application/json')) {
		error(415, 'Neplatná požiadavka');
	}
	const body = await request.text();
	if (body.length > MAX_FEEDBACK_BYTES) error(413, 'Správa je príliš dlhá');

	let raw: unknown;
	try {
		raw = JSON.parse(body);
	} catch {
		error(400, 'Neplatná požiadavka');
	}
	const parsed = feedbackSchema.safeParse(raw);
	if (!parsed.success) error(400, parsed.error.issues[0]?.message ?? 'Neplatná požiadavka');
	if (!getContent().recipeDetails.has(parsed.data.recipeId)) error(404, 'Recept neexistuje');
	if (parsed.data.website) return json({ ok: true });

	const human = await verifyTurnstile({
		secret: env.TURNSTILE_SECRET,
		hostnames: env.TURNSTILE_HOSTNAMES,
		action: 'feedback',
		token: parsed.data.turnstile,
		remoteip: getClientAddress()
	});
	if (!human) error(403, 'Overenie, že nie si robot, zlyhalo. Skús to znova.');

	let saved = false;
	try {
		if ((await feedbackToday(env.DB)) < MAX_FEEDBACK_PER_DAY) {
			await saveFeedback(env.DB, parsed.data);
			saved = true;
		}
	} catch (err) {
		console.error('feedback: save failed', err);
		error(500, 'Nepodarilo sa uložiť');
	}
	if (!saved) error(429, 'Dnes už prišlo veľa správ, skús to zajtra');
	return json({ ok: true }, { status: 201 });
};
