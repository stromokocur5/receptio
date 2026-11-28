<script lang="ts">
	/** The invite link as a QR code, for someone standing next to you: their camera opens it. */
	let { url }: { url: string } = $props();

	let path = $state('');
	let size = $state(0);

	$effect(() => {
		const link = url;
		let cancelled = false;
		// Loaded only when someone asks for the code.
		void import('qrcode-generator').then(({ default: qrcode }) => {
			if (cancelled) return;
			const qr = qrcode(0, 'M');
			qr.addData(link);
			qr.make();
			const n = qr.getModuleCount();
			const cells: string[] = [];
			for (let y = 0; y < n; y++) {
				for (let x = 0; x < n; x++) if (qr.isDark(y, x)) cells.push(`M${x} ${y}h1v1h-1z`);
			}
			size = n;
			path = cells.join('');
		});
		return () => (cancelled = true);
	});
</script>

{#if path}
	<!-- Dark on white with a quiet zone, whatever the theme: phone cameras need the contrast. -->
	<svg
		class="qr"
		viewBox="-4 -4 {size + 8} {size + 8}"
		role="img"
		aria-label="QR kód s pozvánkou do domácnosti"
		shape-rendering="crispEdges"
	>
		<rect x="-4" y="-4" width={size + 8} height={size + 8} fill="#fff" />
		<path d={path} fill="#000" />
	</svg>
{/if}

<style>
	.qr {
		display: block;
		width: min(240px, 70vw);
		height: auto;
		margin: 12px 0 4px;
		border-radius: var(--radius-sm);
	}
</style>
