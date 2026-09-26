import { error, fail } from '@sveltejs/kit';
import { adminData, requireAdmin, setFeedbackStatus, setSuggestionStatus } from '$lib/server/admin';
import type { Actions, PageServerLoad } from './$types';

// Rendered by the Worker on every request, never prerendered or cached.
export const prerender = false;

export const load: PageServerLoad = async (event) => {
	const email = await requireAdmin(event);
	event.setHeaders({ 'cache-control': 'private, no-store' });
	const db = event.platform?.env.DB;
	if (!db) error(503, 'Databáza nie je dostupná');
	try {
		return { email, ...(await adminData(db)) };
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
