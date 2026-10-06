import { error, json } from '@sveltejs/kit';
import {
	deleteReminder,
	reminderIdSchema,
	reminderTokenSchema,
	sendTestReminder,
	supplementUpdateSchema,
	updateSupplementReminder
} from '$lib/server/push';
import type { RequestEvent, RequestHandler } from './$types';

export const prerender = false;

const NO_STORE = { 'cache-control': 'private, no-store' };
const TABLE = 'supplement_reminders';

async function guard({ platform, params, getClientAddress }: RequestEvent) {
	const env = platform?.env;
	if (!env?.DB) error(503, 'Pripomienky teraz nefungujú');
	const limit = await env.SYNC_LIMITER?.limit({ key: getClientAddress() });
	if (limit && !limit.success) error(429, 'Príliš veľa požiadaviek, skús to o chvíľu');
	const id = reminderIdSchema.safeParse(params.id);
	if (!id.success) error(400, 'Neplatná požiadavka');
	return { db: env.DB, id: id.data, vapidJwk: env.VAPID_PRIVATE_JWK };
}

async function readBody(request: Request): Promise<unknown> {
	if (!request.headers.get('content-type')?.startsWith('application/json')) {
		error(415, 'Neplatná požiadavka');
	}
	const text = await request.text();
	if (text.length > 2000) error(413, 'Neplatná požiadavka');
	try {
		return JSON.parse(text);
	} catch {
		error(400, 'Neplatná požiadavka');
	}
}

export const PUT: RequestHandler = async (event) => {
	const { db, id } = await guard(event);
	const body = supplementUpdateSchema.safeParse(await readBody(event.request));
	if (!body.success) error(400, 'Neplatné nastavenie pripomienok');
	let found;
	try {
		found = await updateSupplementReminder(db, id, body.data);
	} catch (err) {
		console.error('push: supplement update failed', err);
		error(500, 'Pripomienky sa nepodarilo uložiť');
	}
	if (!found) error(404, 'Pripomienky na tomto zariadení už nie sú zapnuté');
	return json({ ok: true }, { headers: NO_STORE });
};

export const DELETE: RequestHandler = async (event) => {
	const { db, id } = await guard(event);
	const body = reminderTokenSchema.safeParse(await readBody(event.request));
	if (!body.success) error(400, 'Neplatná požiadavka');
	try {
		await deleteReminder(db, id, body.data.token, TABLE);
	} catch (err) {
		console.error('push: supplement delete failed', err);
		error(500, 'Pripomienky sa nepodarilo vypnúť');
	}
	return json({ ok: true }, { headers: NO_STORE });
};

/** A reminder right now, to check that notifications reach this device. */
export const POST: RequestHandler = async (event) => {
	const { db, id, vapidJwk } = await guard(event);
	const body = reminderTokenSchema.safeParse(await readBody(event.request));
	if (!body.success) error(400, 'Neplatná požiadavka');
	let result;
	try {
		result = await sendTestReminder(db, id, body.data.token, vapidJwk, Date.now(), TABLE);
	} catch (err) {
		console.error('push: supplement test failed', err);
		error(500, 'Skúšobnú pripomienku sa nepodarilo poslať');
	}
	if (result === 'gone') error(404, 'Pripomienky na tomto zariadení už nie sú zapnuté');
	if (result === 'failed') error(502, 'Služba prehliadača pripomienku neprijala, skús to neskôr');
	return json({ ok: true }, { headers: NO_STORE });
};
