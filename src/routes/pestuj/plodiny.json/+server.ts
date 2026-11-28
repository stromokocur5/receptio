import { json } from '@sveltejs/kit';
import { getContent } from '$lib/server/content';
import type { RequestHandler } from './$types';

export const prerender = true;

/** Growing calendars for the home page reminder, loaded only when someone has a saved garden. */
export const GET: RequestHandler = () => json(getContent().grow);
