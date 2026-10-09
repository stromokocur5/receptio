import { z } from 'zod';
import { SYNC_IDLE_DAYS } from '$lib/retention';

/** An encrypted backup is a few kB; this leaves room for years of history. */
export const MAX_SYNC_BYTES = 400_000;
/** New sync codes per day across everyone – a flood guard far above real use. */
export const MAX_NEW_SYNCS_PER_DAY = 1000;

export const syncIdSchema = z.string().regex(/^[0-9a-f]{64}$/);

export const syncPutSchema = z
	.object({
		/** Write token derived from the recovery code; only its hash is stored. */
		token: z.string().regex(/^[0-9a-f]{64}$/),
		/** base64(iv).base64(ciphertext) – opaque to the server. */
		data: z
			.string()
			.max(MAX_SYNC_BYTES)
			.regex(/^[A-Za-z0-9+/]+=*\.[A-Za-z0-9+/]+=*$/),
		/** Write only over this version (what the household phone merged with). */
		ifVersion: z.number().int().min(0).optional(),
		/** A household: tell its other phones at once. */
		announce: z.boolean().optional()
	})
	.strict();

export async function sha256Hex(text: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function readSync(
	db: D1Database,
	id: string
): Promise<{ data: string; updatedAt: number; version?: number } | null> {
	// SELECT * also works before migration 0011 adds the version; phones then skip the check.
	const row = await db
		.prepare('SELECT * FROM sync WHERE id = ?')
		.bind(id)
		.first<{ data: string; updated_at: number; version?: number }>();
	if (!row) return null;
	return {
		data: row.data,
		updatedAt: row.updated_at,
		...(typeof row.version === 'number' && { version: row.version })
	};
}

/** `conflict`: someone else wrote since `ifVersion` – read, merge and try again. */
export type WriteResult = 'saved' | 'forbidden' | 'full' | 'conflict';

/**
 * Creates the backup for a new code or replaces it when the write token matches. The token check
 * is part of the upsert, so a wrong token can never overwrite someone's data.
 */
export async function writeSync(
	db: D1Database,
	id: string,
	token: string,
	data: string,
	now = Date.now(),
	ifVersion?: number
): Promise<{ result: WriteResult; updatedAt: number; version?: number }> {
	const updatedAt = Math.floor(now / 1000);
	const writeHash = await sha256Hex(token);
	const existing = await db
		.prepare('SELECT write_hash FROM sync WHERE id = ?')
		.bind(id)
		.first<{ write_hash: string }>();
	if (existing) {
		if (existing.write_hash !== writeHash) return { result: 'forbidden', updatedAt };
		if (ifVersion === undefined) {
			await db
				.prepare('UPDATE sync SET data = ?, updated_at = ? WHERE id = ? AND write_hash = ?')
				.bind(data, updatedAt, id, writeHash)
				.run();
			return { result: 'saved', updatedAt };
		}
		// The version check is in the same statement, so two writers can't both pass it.
		const updated = await db
			.prepare(
				'UPDATE sync SET data = ?, updated_at = ?, version = version + 1 WHERE id = ? AND write_hash = ? AND version = ? RETURNING version'
			)
			.bind(data, updatedAt, id, writeHash, ifVersion)
			.first<{ version: number }>();
		if (!updated) return { result: 'conflict', updatedAt };
		return { result: 'saved', updatedAt, version: updated.version };
	}
	// A household phone only updates; a deleted copy (new link) must not come back.
	if (ifVersion !== undefined) return { result: 'conflict', updatedAt };
	await pruneIdleSyncs(db, updatedAt);
	const today = await db
		.prepare('SELECT COUNT(*) AS n FROM sync WHERE created_at > ?')
		.bind(updatedAt - 24 * 60 * 60)
		.first<{ n: number }>();
	if ((today?.n ?? 0) >= MAX_NEW_SYNCS_PER_DAY) return { result: 'full', updatedAt };
	const inserted = await db
		.prepare(
			'INSERT INTO sync (id, write_hash, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING'
		)
		.bind(id, writeHash, data, updatedAt)
		.run();
	// Another device created it a moment ago: go through the token check like any update.
	if (inserted.meta.changes === 0) return writeSync(db, id, token, data, now, ifVersion);
	return { result: 'saved', updatedAt, version: 0 };
}

/** Runs when a new code is created – often enough, and needs no scheduled job. */
export async function pruneIdleSyncs(db: D1Database, nowSeconds: number): Promise<void> {
	await db
		.prepare('DELETE FROM sync WHERE updated_at < ?')
		.bind(nowSeconds - SYNC_IDLE_DAYS * 24 * 60 * 60)
		.run();
}

export async function deleteSync(db: D1Database, id: string, token: string): Promise<boolean> {
	const result = await db
		.prepare('DELETE FROM sync WHERE id = ? AND write_hash = ?')
		.bind(id, await sha256Hex(token))
		.run();
	return result.meta.changes > 0;
}
