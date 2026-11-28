import { error, fail } from '@sveltejs/kit';
import {
	adminData,
	adminHealth,
	requireAdmin,
	setAdminAlert,
	setFeedbackStatus,
	setSuggestionStatus
} from '$lib/server/admin';
import type { Actions, PageServerLoad } from './$types';

// Rendered by the Worker on every request, never prerendered or cached.
export const prerender = false;

export const load: PageServerLoad = async (event) => {
	const email = await requireAdmin(event);
	event.setHeaders({ 'cache-control': 'private, no-store' });
	const db = event.platform?.env.DB;
	if (!db) error(503, 'Databáza nie je dostupná');
	try {
		const [data, health] = await Promise.all([
			adminData(db),
			// Before migration 0009 is applied the page still works, just without the check.
			adminHealth(db).catch(() => null)
		]);
		return { email, ...data, status: health };
	} catch (err) {
		console.error('admin: load failed', err);
		error(500, 'Nepodarilo sa načítať dáta');
	}
};

function parseId(form: FormData): number | null {
	const id = Number(form.get('id'));
	return Number.isInteger(id) && id > 0 ? id : null;
}

export const actions: Actions = {
	alerts: async (event) => {
		await requireAdmin(event);
		const form = await event.request.formData();
		const endpoint = form.get('endpoint');
		const on = form.get('on') === '1';
		if (typeof endpoint !== 'string' || endpoint.length > 1000) return fail(400);
		if (!(await setAdminAlert(event.platform!.env.DB, endpoint, on))) return fail(400);
		return { alerts: on };
	},
	feedback: async (event) => {
		await requireAdmin(event);
		const form = await event.request.formData();
		const id = parseId(form);
		const status = form.get('status');
		if (!id || (status !== 'new' && status !== 'done')) return fail(400);
		await setFeedbackStatus(event.platform!.env.DB, id, status);
	},
	suggestion: async (event) => {
		await requireAdmin(event);
		const form = await event.request.formData();
		const id = parseId(form);
		const status = form.get('status');
		if (!id || (status !== 'new' && status !== 'added' && status !== 'rejected')) return fail(400);
		await setSuggestionStatus(event.platform!.env.DB, id, status);
	}
};
