import { error, json } from '@sveltejs/kit';
import {
	MAX_SYNC_BYTES,
	deleteSync,
	readSync,
	syncIdSchema,
	syncPutSchema,
	writeSync
} from '$lib/server/sync';
import { announce } from '$lib/server/household-room';
import type { RequestEvent, RequestHandler } from './$types';

export const prerender = false;

const NO_STORE = { 'cache-control': 'private, no-store' };

async function guard({ platform, params, getClientAddress }: RequestEvent) {
	const env = platform?.env;
	if (!env?.DB) error(503, 'Synchronizácia teraz nefunguje');
	const limit = await env.SYNC_LIMITER?.limit({ key: getClientAddress() });
	if (limit && !limit.success) error(429, 'Príliš veľa požiadaviek, skús to o chvíľu');
	const id = syncIdSchema.safeParse(params.id);
	if (!id.success) error(400, 'Neplatný kód');
	return { db: env.DB, id: id.data };
}

async function readBody(request: Request) {
	if (!request.headers.get('content-type')?.startsWith('application/json')) {
		error(415, 'Neplatná požiadavka');
	}
	const text = await request.text();
	if (text.length > MAX_SYNC_BYTES + 1000) error(413, 'Záloha je príliš veľká');
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		error(400, 'Neplatná požiadavka');
	}
	return raw;
}

export const GET: RequestHandler = async (event) => {
	const { db, id } = await guard(event);
	let found;
	try {
		found = await readSync(db, id);
	} catch (err) {
		console.error('sync: read failed', err);
		error(500, 'Nepodarilo sa načítať zálohu');
	}
	if (!found) error(404, 'Pre tento kód tu nie sú žiadne dáta');
	// The phone has this version already: no need to send the whole copy again.
	const known = Number(event.url.searchParams.get('known'));
	if (
		found.version !== undefined &&
		event.url.searchParams.has('known') &&
		known === found.version
	) {
		return json({ unchanged: true, version: found.version }, { headers: NO_STORE });
	}
	return json(found, { headers: NO_STORE });
};

export const PUT: RequestHandler = async (event) => {
	const { db, id } = await guard(event);
	const body = syncPutSchema.safeParse(await readBody(event.request));
	if (!body.success) error(400, 'Neplatná záloha');
	let outcome;
	try {
		outcome = await writeSync(
			db,
			id,
			body.data.token,
			body.data.data,
			Date.now(),
			body.data.ifVersion
		);
	} catch (err) {
		console.error('sync: write failed', err);
		error(500, 'Zálohu sa nepodarilo uložiť');
	}
	if (outcome.result === 'forbidden') error(403, 'Tento kód patrí inej zálohe');
	if (outcome.result === 'full') error(429, 'Dnes už vzniklo priveľa nových záloh, skús zajtra');
	if (outcome.result === 'conflict') error(409, 'Medzitým to zmenil niekto iný');
	if (body.data.announce && outcome.version !== undefined) {
		event.platform?.ctx?.waitUntil(announce(event.platform.env, id, outcome.version));
	}
	return json({ updatedAt: outcome.updatedAt, version: outcome.version }, { headers: NO_STORE });
};

export const DELETE: RequestHandler = async (event) => {
	const { db, id } = await guard(event);
	const body = syncPutSchema.pick({ token: true }).safeParse(await readBody(event.request));
	if (!body.success) error(400, 'Neplatná požiadavka');
	try {
		await deleteSync(db, id, body.data.token);
	} catch (err) {
		console.error('sync: delete failed', err);
		error(500, 'Zálohu sa nepodarilo zmazať');
	}
	return json({ ok: true }, { headers: NO_STORE });
};
