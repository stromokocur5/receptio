<script lang="ts">
	import { onDestroy } from 'svelte';
	import { formatGrams } from '$lib/amounts';
	import { isBarcode, lookupProduct, matchIngredients, type Product } from '$lib/barcode';
	import { useCatalog } from '$lib/catalog';
	import Icon from '$lib/components/Icon.svelte';
	import { ingredientSearchText, normalizeSearch } from '$lib/labels';
	import { pantry, setPantryItem } from '$lib/state.svelte';

	/**
	 * Adds a bought product to the pantry by its barcode: the camera reads it where the browser
	 * can (Chrome, Edge, Samsung on Android), anywhere else the number is typed in. Which
	 * ingredient it is gets suggested from the product's name; the person picks.
	 */
	const catalog = useCatalog();

	let open = $state(false);
	let code = $state('');
	let status = $state<'idle' | 'camera' | 'looking' | 'found' | 'unknown' | 'error'>('idle');
	let product = $state<Product | null>(null);
	let picks = $state<string[]>([]);
	let grams = $state('');
	let other = $state('');
	let added = $state('');
	let video = $state<HTMLVideoElement>();
	let stream: MediaStream | null = null;
	let scanning = false;

	type Detector = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> };
	const Detector = (globalThis as unknown as { BarcodeDetector?: new (o: object) => Detector })
		.BarcodeDetector;
	const canScan = typeof navigator !== 'undefined' && !!Detector && !!navigator.mediaDevices;

	const others = $derived.by(() => {
		const q = normalizeSearch(other.trim());
		if (q.length < 2) return [];
		return catalog.ingredients.filter((i) => ingredientSearchText(i).includes(q)).slice(0, 6);
	});

	async function startCamera() {
		if (!Detector) return;
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: 'environment' },
				audio: false
			});
		} catch {
			status = 'error';
			return;
		}
		status = 'camera';
		await Promise.resolve();
		if (!video) return;
		video.srcObject = stream;
		await video.play().catch(() => {});
		const detector = new Detector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
		scanning = true;
		while (scanning && video) {
			const found = await detector.detect(video).catch(() => []);
			const value = found.find((f) => isBarcode(f.rawValue))?.rawValue;
			if (value) {
				stopCamera();
				code = value;
				await look();
				return;
			}
			await new Promise((r) => setTimeout(r, 250));
		}
	}

	function stopCamera() {
		scanning = false;
		for (const track of stream?.getTracks() ?? []) track.stop();
		stream = null;
	}

	async function look() {
		const value = code.trim();
		if (!isBarcode(value)) return;
		status = 'looking';
		added = '';
		try {
			product = await lookupProduct(value);
		} catch {
			status = 'error';
			return;
		}
		if (!product) {
			status = 'unknown';
			return;
		}
		picks = matchIngredients(product, catalog.ingredients);
		grams = product.grams ? String(product.grams) : '';
		status = 'found';
	}

	function add(id: string) {
		const amount = Number(grams.replace(',', '.'));
		const known = grams.trim() !== '' && Number.isFinite(amount) && amount > 0;
		const now = pantry.current[id];
		// Bought more of something already at home: the amounts add up.
		setPantryItem(
			id,
			known ? Math.round((typeof now === 'number' ? now : 0) + amount) : (now ?? null)
		);
		const name = catalog.ingredientsById.get(id)?.name ?? id;
		added = known ? `${name}: +${formatGrams(amount)}` : name;
		product = null;
		code = '';
		other = '';
		status = 'idle';
	}

	function close() {
		stopCamera();
		open = false;
		status = 'idle';
		product = null;
	}

	onDestroy(stopCamera);
</script>

{#if !open}
	<button class="btn ghost small" onclick={() => (open = true)}>
		<Icon name="barcode" size={16} /> Pridať podľa čiarového kódu
	</button>
{:else}
	<div class="scanner card">
		<div class="row">
			{#if canScan && status !== 'camera'}
				<button class="btn leaf small" onclick={startCamera}>
					<Icon name="barcode" size={16} /> Naskenovať
				</button>
			{/if}
			<form
				class="code"
				onsubmit={(e) => {
					e.preventDefault();
					void look();
				}}
			>
				<label class="sr-only" for="barcode-code">Číslo pod čiarovým kódom</label>
				<input
					id="barcode-code"
					inputmode="numeric"
					autocomplete="off"
					placeholder="alebo číslo pod kódom"
					bind:value={code}
				/>
				<button class="btn ghost small" type="submit" disabled={!isBarcode(code)}>Hľadať</button>
			</form>
			<button class="btn ghost small" onclick={close} aria-label="Zavrieť">
				<Icon name="x" size={16} />
			</button>
		</div>

		{#if status === 'camera'}
			<!-- svelte-ignore a11y_media_has_caption -->
			<video bind:this={video} playsinline muted></video>
			<p class="muted small">Namier fotoaparát na čiarový kód.</p>
		{:else if status === 'looking'}
			<p class="muted">Hľadám produkt…</p>
		{:else if status === 'unknown'}
			<p>
				Tento kód v otvorenej databáze potravín zatiaľ nie je. Surovinu nájdeš aj vyhľadávaním hore.
			</p>
		{:else if status === 'error'}
			<p>Fotoaparát alebo databáza teraz nejde. Skús zadať číslo pod kódom.</p>
		{:else if status === 'found' && product}
			<p>
				<strong>{product.name || 'Produkt bez názvu'}</strong>
				{#if product.grams}<span class="muted"> · {formatGrams(product.grams)}</span>{/if}
			</p>
			<label class="amount">
				Koľko gramov pridať
				<input inputmode="decimal" bind:value={grams} placeholder="nevieš – nechaj prázdne" />
			</label>
			<p class="small">Ktorá surovina to je?</p>
			<div class="picks">
				{#each picks as id (id)}
					<button class="chip" onclick={() => add(id)}>
						{catalog.ingredientsById.get(id)?.name}
					</button>
				{:else}
					<span class="muted small">Nič podobné – nájdi ju:</span>
				{/each}
			</div>
			<input class="other" type="search" placeholder="Iná surovina…" bind:value={other} />
			{#if others.length}
				<div class="picks">
					{#each others as i (i.id)}
						<button class="chip" onclick={() => add(i.id)}>{i.name}</button>
					{/each}
				</div>
			{/if}
		{/if}
		{#if added}
			<p class="done" role="status"><Icon name="check" size={16} /> V špajzi: {added}</p>
		{/if}
		<p class="muted small">
			Údaje o produktoch sú z Open Food Facts; posiela sa im len číslo kódu.
		</p>
	</div>
{/if}

<style>
	.scanner {
		display: grid;
		gap: 10px;
		padding: 14px;
		margin-top: 10px;
	}
	.row,
	.code,
	.picks {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
	}
	.code {
		flex: 1 1 200px;
	}
	input {
		border: 1.5px solid var(--line);
		border-radius: var(--radius-sm);
		background: var(--paper);
		color: var(--ink);
		padding: 8px 10px;
		font: inherit;
		min-width: 0;
		flex: 1 1 140px;
	}
	.amount {
		display: grid;
		gap: 4px;
		font-weight: 650;
		font-size: 0.9rem;
	}
	video {
		width: 100%;
		max-height: 50vh;
		border-radius: var(--radius-sm);
		background: #000;
	}
	p {
		margin: 0;
	}
	.done {
		color: var(--leaf);
		font-weight: 650;
	}
</style>
