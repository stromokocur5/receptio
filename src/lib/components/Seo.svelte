<script lang="ts">
	import { page } from '$app/state';
	import { SITE_NAME, SITE_ORIGIN } from '$lib/site';

	let {
		title,
		description = 'Vegánske a bezlepkové recepty so živinami, cenami, špajzou a nákupným zoznamom.',
		image = '/og/receptio.png',
		type = 'website'
	}: {
		/** Page title without the site name; omitted on the home page. */
		title?: string;
		description?: string;
		image?: string;
		type?: 'website' | 'article';
	} = $props();

	const fullTitle = $derived(
		title ? `${title} · ${SITE_NAME}` : `${SITE_NAME} – rastlinné recepty`
	);
	const url = $derived(SITE_ORIGIN + page.url.pathname);
</script>

<svelte:head>
	<title>{fullTitle}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={url} />
	<meta property="og:site_name" content={SITE_NAME} />
	<meta property="og:locale" content="sk_SK" />
	<meta property="og:type" content={type} />
	<meta property="og:url" content={url} />
	<meta property="og:title" content={title ?? fullTitle} />
	<meta property="og:description" content={description} />
	<meta property="og:image" content={SITE_ORIGIN + image} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta name="twitter:card" content="summary_large_image" />
</svelte:head>
