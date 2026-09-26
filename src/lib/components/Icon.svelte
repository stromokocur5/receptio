<script lang="ts" module>
	/**
	 * Hand-drawn icon set on a 24×24 grid. Every shape gets pathLength="1" so CSS can
	 * animate a "drawing" stroke without knowing real path lengths.
	 */
	const ICONS = {
		leaf: '<path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15"/><path d="M5 19c3-4 6-7 10-9"/>',
		bowl: '<path d="M3 11h18a9 9 0 0 1-18 0Z"/><path d="M8 20.5h8"/><path d="M9 7.5c0-1.6 1-2 1-3.5M13 7.5c0-1.6 1-2 1-3.5"/>',
		jar: '<path d="M8 5V3.5h8V5"/><rect x="5" y="5" width="14" height="16" rx="3"/><path d="M5 10.5h14"/><path d="M9 15h6"/>',
		calendar:
			'<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8 14h2M14 14h2M8 17h2"/>',
		basket:
			'<path d="M3 10h18l-2 9.5a2 2 0 0 1-2 1.5H7a2 2 0 0 1-2-1.5Z"/><path d="M7.5 10 11 4M16.5 10 13 4"/><path d="M9 14v3M12 14v3M15 14v3"/>',
		tag: '<path d="M3 12V4.5A1.5 1.5 0 0 1 4.5 3H12l9 9-9 9Z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
		book: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v14H6.5A1.5 1.5 0 0 0 5 18.5Z"/><path d="M5 18.5A1.5 1.5 0 0 0 6.5 20H19v-3"/><path d="M9 7.5h6M9 10.5h4"/>',
		globe:
			'<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.8 2.5 4 5.5 4 9s-1.2 6.5-4 9c-2.8-2.5-4-5.5-4-9s1.2-6.5 4-9Z"/>',
		heart:
			'<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z"/>',
		clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
		flame:
			'<path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.3 2.3-5.3 3.6-7.8.4 1.6 1.2 2.6 2.3 3.2C11.6 7.3 13 4.9 15.4 3c-.3 3 1.1 5 2.2 6.8.8 1.3 1.4 2.6 1.4 4.3C19 18.2 16 21 12 21Z"/>',
		bean: '<path d="M8.5 20C5 20 3.5 17 4.5 13.5 5.6 9.7 9 9.9 10.5 7.2 12.2 4.1 14.3 3 16.5 3 19.6 3 21 5.6 21 8.3c0 3.7-3 5.2-5.2 7.4C13.4 18 11.8 20 8.5 20Z"/><path d="M9 15.5c1.8-.4 3.3-1.8 4.2-3.5"/>',
		wheat:
			'<path d="M12 21V8"/><path d="M12 12.5c-2.5 0-4-1.5-4-4 2.5 0 4 1.5 4 4Zm0 0c2.5 0 4-1.5 4-4-2.5 0-4 1.5-4 4Z"/><path d="M12 17c-2.5 0-4-1.5-4-4 2.5 0 4 1.5 4 4Zm0 0c2.5 0 4-1.5 4-4-2.5 0-4 1.5-4 4Z"/><path d="M12 8c-1.3-1-1.7-2.5-1-4.3L12 2.5l1 1.2c.7 1.8.3 3.3-1 4.3Z"/>',
		'wheat-off':
			'<path d="M12 21V8"/><path d="M12 12.5c-2.5 0-4-1.5-4-4 2.5 0 4 1.5 4 4Zm0 0c2.5 0 4-1.5 4-4-2.5 0-4 1.5-4 4Z"/><path d="M12 17c-2.5 0-4-1.5-4-4 2.5 0 4 1.5 4 4Zm0 0c2.5 0 4-1.5 4-4-2.5 0-4 1.5-4 4Z"/><path d="M3.5 3.5l17 17"/>',
		alert: '<path d="M12 3.5 21.5 20h-19Z"/><path d="M12 10v4.5"/><path d="M12 17.2v.1"/>',
		info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><path d="M12 7.7v.1"/>',
		plus: '<path d="M12 5v14M5 12h14"/>',
		minus: '<path d="M5 12h14"/>',
		check: '<path d="m4.5 12.5 5 5 10-11"/>',
		x: '<path d="M6 6l12 12M18 6 6 18"/>',
		search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',
		sliders:
			'<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
		'arrow-right': '<path d="M4 12h15M13 6l6 6-6 6"/>',
		'arrow-left': '<path d="M20 12H5M11 6l-6 6 6 6"/>',
		sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5V5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
		moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>',
		drop: '<path d="M12 3s6.5 7 6.5 11.5a6.5 6.5 0 0 1-13 0C5.5 10 12 3 12 3Z"/><path d="M9 15a3 3 0 0 0 3 3"/>',
		pill: '<rect x="3" y="8.5" width="18" height="7" rx="3.5" transform="rotate(-35 12 12)"/><path d="M10 9.1l4 5.8"/>',
		salt: '<path d="M8 9h8l1 11.5H7Z"/><path d="M8.5 9 9 4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5l.5 4.5"/><path d="M11 6v.1M13 6v.1"/>',
		bolt: '<path d="M13 2.5 5 13.5h6l-1 8 8-11h-6Z"/>',
		shield:
			'<path d="M12 3 19.5 6v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6Z"/><path d="m9 12 2 2 4-4"/>',
		bone: '<path d="M8.5 15.5 15.5 8.5"/><path d="M15.5 8.5a2.5 2.5 0 1 1 2.8-3.8 2.5 2.5 0 1 1 1 4 2.5 2.5 0 0 1-3.8-.2Z"/><path d="M8.5 15.5a2.5 2.5 0 1 1-2.8 3.8 2.5 2.5 0 1 1-1-4 2.5 2.5 0 0 1 3.8.2Z"/>',
		spoon:
			'<ellipse cx="15.5" cy="8.5" rx="3.8" ry="5" transform="rotate(45 15.5 8.5)"/><path d="M12.8 11.2 4 20"/>',
		cube: '<path d="M12 3 20 7.5v9L12 21l-8-4.5v-9Z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/>',
		onion:
			'<path d="M12 4c-1 2.5-6.5 4.5-6.5 10a6.5 6.5 0 0 0 13 0C18.5 8.5 13 6.5 12 4Z"/><path d="M12 4V2.5"/><path d="M12 9c-1.5 2-2.5 4-2.5 6.5M12 9c1.5 2 2.5 4 2.5 6.5"/>',
		garlic:
			'<path d="M12 4c.5 2 5.5 3.5 6.5 8.5.8 4-2.5 8-6.5 8s-7.3-4-6.5-8C6.5 7.5 11.5 6 12 4Z"/><path d="M12 4V2.5M12 10c-2 2.5-2 7 0 10.5M12 10c2 2.5 2 7 0 10.5"/>',
		spice:
			'<path d="M3.5 11h17a8.5 8.5 0 0 1-17 0Z"/><path d="M8 20.5h8"/><path d="m13 11 6-7.5"/>',
		pasta:
			'<path d="M6 3v5a2 2 0 0 0 4 0V3M8 3v18"/><path d="M14 8.5c2.5-1.6 6-.5 6 2.5s-3.5 4-5.3 2.7c-1.6-1.2-.4-3.7 1.6-3.2"/><path d="M14 17.5c1.5 1 4 1 5.5-.5"/>',
		chef: '<path d="M7 14.5V20h10v-5.5"/><path d="M7 14.5a4 4 0 0 1-1.2-7.7A5 5 0 0 1 12 4a5 5 0 0 1 6.2 2.8A4 4 0 0 1 17 14.5Z"/><path d="M7 17h10"/>',
		users:
			'<circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.5c1.8.9 3 3 3 5.5"/>',
		euro: '<path d="M17.5 6.5a7 7 0 1 0 0 11"/><path d="M4 10h9M4 14h9"/>',
		sparkle:
			'<path d="M12 3c.5 4 2 5.5 6 6-4 .5-5.5 2-6 6-.5-4-2-5.5-6-6 4-.5 5.5-2 6-6Z"/><path d="M19 15c.2 1.6.9 2.3 2.5 2.5-1.6.2-2.3.9-2.5 2.5-.2-1.6-.9-2.3-2.5-2.5 1.6-.2 2.3-.9 2.5-2.5Z"/>',
		trash: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/>',
		home: '<path d="M4 11 12 4l8 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>',
		store:
			'<path d="M4 9.5 5.5 4h13L20 9.5"/><path d="M4 9.5c0 1.4 1.1 2.5 2.7 2.5s2.6-1.1 2.6-2.5c0 1.4 1.1 2.5 2.7 2.5s2.7-1.1 2.7-2.5c0 1.4 1 2.5 2.6 2.5S20 10.9 20 9.5"/><path d="M5.5 12v8h13v-8"/><path d="M10 20v-4.5h4V20"/>',
		copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>',
		external:
			'<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
		package:
			'<path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5Z"/><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9"/><path d="m7.8 5.3 8.4 4.5"/>',
		star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9Z"/>',
		pot: '<path d="M4 10h16v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4Z"/><path d="M2 10h20M9 6.5c0-1 .8-1.5.8-2.5M14 6.5c0-1 .8-1.5.8-2.5"/>'
	} as const;

	export type IconName = keyof typeof ICONS;
	export const ICON_NAMES = Object.keys(ICONS) as IconName[];

	const drawable = /<(path|circle|rect|ellipse|line|polyline)\b/g;
	const RENDERED = Object.fromEntries(
		Object.entries(ICONS).map(([k, v]) => [k, v.replace(drawable, '<$1 pathLength="1"')])
	) as Record<IconName, string>;

	export function isIconName(name: string): name is IconName {
		return name in ICONS;
	}
</script>

<script lang="ts">
	let {
		name,
		size = 22,
		stroke = 1.8,
		draw = false,
		label
	}: {
		name: IconName;
		size?: number;
		stroke?: number;
		/** Animate the stroke drawing in on mount. */
		draw?: boolean;
		label?: string;
	} = $props();
</script>

<svg
	class="icon"
	class:draw
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width={stroke}
	stroke-linecap="round"
	stroke-linejoin="round"
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- static, trusted markup from ICONS -->
	{@html RENDERED[name]}
</svg>

<style>
	.icon {
		flex: none;
		overflow: visible;
	}
	.icon :global(*) {
		stroke-dasharray: 1;
		stroke-dashoffset: 0;
	}
	.icon.draw :global(*) {
		animation: draw 0.9s var(--ease-out) both;
	}
	.icon.draw :global(*:nth-child(2)) {
		animation-delay: 0.12s;
	}
	.icon.draw :global(*:nth-child(3)) {
		animation-delay: 0.24s;
	}
	.icon.draw :global(*:nth-child(4)) {
		animation-delay: 0.36s;
	}
	/* Any hovered ancestor marked .draw-host re-draws its icons. */
	:global(.draw-host:hover) .icon :global(*) {
		animation: draw 0.7s var(--ease-out) both;
	}
	:global(.draw-host:hover) .icon :global(*:nth-child(2)) {
		animation-delay: 0.08s;
	}
	:global(.draw-host:hover) .icon :global(*:nth-child(3)) {
		animation-delay: 0.16s;
	}
	@keyframes draw {
		from {
			stroke-dashoffset: 1;
		}
		to {
			stroke-dashoffset: 0;
		}
	}
</style>
