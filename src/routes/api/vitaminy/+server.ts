import { error, json } from '@sveltejs/kit';
import { createSupplementReminder, supplementCreateSchema } from '$lib/server/push';
import type { RequestHandler } from './$types';

export const prerender = false;

const NO_STORE = { 'cache-control': 'private, no-store' };

export const POST: RequestHandler = async ({ platform, request, getClientAddress }) => {
	const env = platform?.env;
	if (!env?.DB) error(503, 'Pripomienky teraz nefungujú');
	const limit = await env.NEW_DEVICE_LIMITER?.limit({ key: getClientAddress() });
	if (limit && !limit.success) error(429, 'Príliš veľa požiadaviek, skús to o chvíľu');
	if (!request.headers.get('content-type')?.startsWith('application/json')) {
		error(415, 'Neplatná požiadavka');
	}
	const text = await request.text();
	if (text.length > 2000) error(413, 'Neplatná požiadavka');
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		error(400, 'Neplatná požiadavka');
	}
	const body = supplementCreateSchema.safeParse(raw);
	if (!body.success) error(400, 'Neplatné nastavenie pripomienok');
	let created;
	try {
		created = await createSupplementReminder(env.DB, body.data);
	} catch (err) {
		console.error('push: supplement create failed', err);
		error(500, 'Pripomienky sa nepodarilo zapnúť');
	}
	if (created === 'full') error(429, 'Pripomienky sú teraz plné, skús neskôr');
	return json(created, { status: 201, headers: NO_STORE });
};
