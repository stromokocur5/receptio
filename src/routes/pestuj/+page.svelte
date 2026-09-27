<script lang="ts">
	import { onMount } from 'svelte';
	import { formatNumber } from '$lib/amounts';
	import GrowMonths from '$lib/components/GrowMonths.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import { planGarden, sowNow, type GardenInput } from '$lib/garden';
	import { IN_MONTH, MONTH_NAMES } from '$lib/season';
	import type { GrowGuide, GrowPlace, GrowSun } from '$lib/types';

	let { data } = $props();

	const PLACES: { id: GrowPlace; label: string; hint: string; area: number }[] = [
		{ id: 'parapet', label: 'Byt, okno', hint: 'parapet, kuchynská linka', area: 0.3 },
		{ id: 'balkon', label: 'Balkón', hint: 'nádoby, truhlíky', area: 2 },
		{ id: 'zahrada', label: 'Záhrada', hint: 'záhon, pole', area: 20 }
	];
	const SUNS: { id: GrowSun; label: string }[] = [
		{ id: 'slnko', label: 'Slnko väčšinu dňa' },
		{ id: 'polotien', label: 'Pár hodín slnka' },
		{ id: 'tien', label: 'Bez priameho slnka' }
	];
	const LEVELS: { id: 1 | 2 | 3; label: string }[] = [
		{ id: 1, label: 'Začínam' },
		{ id: 2, label: 'Niečo som už pestoval/a' },
		{ id: 3, label: 'Mám skúsenosti' }
	];
	const PLACE_LABELS: Record<GrowPlace, string> = {
		parapet: 'byt',
		balkon: 'balkón',
		zahrada: 'záhrada'
	};
	const SUN_LABELS: Record<GrowSun, string> = {
		slnko: 'slnko',
		polotien: 'polotieň',
		tien: 'tieň'
	};
	const LEVEL_LABELS = ['', 'ľahké', 'treba sa starať', 'pre pokročilých'];

	const STORAGE_KEY = 'receptio:garden';
	let input = $state<GardenInput>({ place: 'balkon', area: 2, sun: 'slnko', level: 1 });
	let month = $state(new Date().getMonth() + 1);

	onMount(() => {
		month = new Date().getMonth() + 1;
		try {
			const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
			if (saved && PLACES.some((p) => p.id === saved.place)) input = { ...input, ...saved };
		} catch {
			// Starts from the defaults.
		}
	});

	function save() {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(input));
		} catch {
			// The planner still works, it just won't remember.
		}
	}

	function setPlace(id: GrowPlace) {
		input.place = id;
		input.area = PLACES.find((p) => p.id === id)!.area;
		save();
	}

	const plan = $derived(planGarden(input, data.growCombos, data.grow));
	const guideById = $derived(new Map(data.grow.map((g) => [g.ingredientId, g])));
	const nameById = $derived(
		new Map([...data.grow, ...data.notGrown].map((g) => [g.ingredientId, g.name]))
	);
	const recommended = $derived(data.grow.filter((g) => g.recommend));
	const planMonths = $derived(
		plan.calendar.filter((c) => c.indoor.length || c.sow.length || c.harvest.length)
	);

	let placeFilter = $state<GrowPlace | ''>('');
	let onlyNow = $state(false);
	let onlyEasy = $state(false);
	const nowIds = $derived(new Set(sowNow(data.grow, month).map((g) => g.ingredientId)));
	const crops = $derived(
		data.grow.filter(
			(g) =>
				(!placeFilter || g.where.includes(placeFilter)) &&
				(!onlyNow || nowIds.has(g.ingredientId)) &&
				(!onlyEasy || g.level === 1)
		)
	);

	const notHere = $derived(data.notGrown.filter((n) => n.status === 'nie'));
	const hardHere = $derived(data.notGrown.filter((n) => n.status === 'tazko'));

	function names(ids: string[]): string {
		return ids.map((id) => nameById.get(id) ?? id).join(', ');
	}

	function spacing(g: GrowGuide): string {
		if (!g.spacing) return 'nahusto';
		return g.spacing >= 100
			? `${formatNumber(g.spacing / 100)} m od seba`
			: `${g.spacing} cm od seba`;
	}
</script>

<Seo
	title="Pestuj si sám"
	description="Čo sa oplatí pestovať na Slovensku, plánovač záhradky, balkóna aj okna v byte so zmiešanými výsadbami a kalendárom."
/>

<div class="wrap page">
	<header class="rise">
		<p class="eyebrow"><Icon name="sprout" size={16} /> Pestuj si sám</p>
		<h1>Pestuj si sám</h1>
		<p class="lede">
			Aj z okna v byte sa dá zbierať – a zo záhonu celé jedlá. Tu nájdeš, čo sa u nás oplatí
			pestovať, plánovač, ktorý ti z tvojho miesta navrhne zmiešané výsadby, a návod ku každej
			plodine.
		</p>
		<nav class="jump" aria-label="Na stránke">
			<a class="chip" href="#oplati-sa">Čo sa oplatí</a>
			<a class="chip" href="#planovac">Plánovač</a>
			<a class="chip" href="#plodiny">Všetky plodiny</a>
			<a class="chip" href="#nepestuje-sa">Čo u nás nerastie</a>
			<a class="chip" href="/wiki/ako-zacat-pestovat">Ako začať</a>
			<a class="chip" href="/wiki/naradie-na-pestovanie">Náradie a nádoby</a>
		</nav>
	</header>

	<section id="oplati-sa" class="block">
		<h2>Čo sa u nás oplatí pestovať</h2>
		<p class="muted">
			Plodiny, ktoré zvládnu slovenské leto aj suchšie roky, dajú veľa jedla z malej plochy alebo
			ušetria najviac peňazí.
		</p>
		<div class="rec-grid">
			{#each recommended as g (g.ingredientId)}
				<a class="card rec" href="#p-{g.ingredientId}">
					<strong>{g.name}</strong>
					<span>{g.recommend}</span>
					<small class="muted">
						{g.where.map((w) => PLACE_LABELS[w]).join(' · ')} · {LEVEL_LABELS[g.level]}
					</small>
				</a>
			{/each}
		</div>
	</section>

	<section id="planovac" class="block card planner">
		<h2><Icon name="sparkle" size={22} /> Plánovač</h2>
		<p class="muted">
			Povedz, koľko máš miesta, a plánovač ho zaplní kombináciami rastlín, ktoré si navzájom
			pomáhajú – namiesto jedného záhonu kapusty, kde sa darí hlavne škodcom.
		</p>

		<div class="form">
			<fieldset>
				<legend>Kde</legend>
				<div class="opts">
					{#each PLACES as p (p.id)}
						<button class="opt" aria-pressed={input.place === p.id} onclick={() => setPlace(p.id)}>
							<strong>{p.label}</strong>
							<small>{p.hint}</small>
						</button>
					{/each}
				</div>
			</fieldset>
			<label class="area">
				<span>Plocha</span>
				<span class="area-input">
					<input
						type="number"
						min="0.1"
						max="10000"
						step={input.place === 'zahrada' ? 1 : 0.1}
						bind:value={input.area}
						oninput={save}
					/>
					m²
				</span>
				<small class="muted">
					{input.place === 'parapet'
						? '0,1 m² je zhruba jeden kvetináč'
						: input.place === 'balkon'
							? 'podlaha, ktorú môžeš zaplniť nádobami'
							: '1 ár = 100 m²; pätinu nechám na chodníky'}
				</small>
			</label>
			<fieldset>
				<legend>Svetlo</legend>
				<div class="chips">
					{#each SUNS as s (s.id)}
						<button
							class="chip"
							aria-pressed={input.sun === s.id}
							onclick={() => {
								input.sun = s.id;
								save();
							}}>{s.label}</button
						>
					{/each}
				</div>
			</fieldset>
			<fieldset>
				<legend>Skúsenosti</legend>
				<div class="chips">
					{#each LEVELS as l (l.id)}
						<button
							class="chip"
							aria-pressed={input.level === l.id}
							onclick={() => {
								input.level = l.id;
								save();
							}}>{l.label}</button
						>
					{/each}
				</div>
			</fieldset>
		</div>

		{#if plan.combos.length}
			<p class="summary">
				Na {formatNumber(input.area)} m² sa zmestí
				<strong>{plan.combos.length}</strong>
				{plan.combos.length === 1 ? 'výsadba' : plan.combos.length < 5 ? 'výsadby' : 'výsadieb'}
				s {plan.plants.length} druhmi rastlín{plan.paths
					? `, ${formatNumber(plan.paths)} m² ostane na chodníky`
					: ''}{plan.free >= 0.1 ? ` a ${formatNumber(plan.free)} m² máš voľných` : ''}.
			</p>
			<ol class="combos">
				{#each plan.combos as { combo, modules, area } (combo.id)}
					<li class="combo">
						<div class="combo-head">
							<h3>{combo.name}</h3>
							<span class="badge leaf">
								{modules > 1 ? `${modules} × ` : ''}{formatNumber(combo.area)} m² ={' '}
								{formatNumber(area)} m²
							</span>
						</div>
						<p class="members">
							{#each combo.members as m, i (m.ingredientId)}{i ? ' · ' : ''}<a
									href="#p-{m.ingredientId}">{m.count * modules} × {m.name}</a
								>{/each}
						</p>
						<p>{combo.how}</p>
						<p class="why"><Icon name="heart" size={16} /> {combo.why}</p>
					</li>
				{/each}
			</ol>

			<div class="plan-cols">
				<section>
					<h3>Čo si zaobstarať</h3>
					<ul class="shopping">
						{#each plan.plants as p (p.ingredientId)}
							{@const g = guideById.get(p.ingredientId)}
							<li>
								<strong>{p.count}</strong>
								{p.name}
								<small class="muted">
									{g?.perennial
										? 'sadenica, trvalka'
										: g?.indoor.length
											? 'semená na predpestovanie alebo sadenice'
											: 'semená'}
								</small>
							</li>
						{/each}
					</ul>
				</section>
				<section>
					<h3>Kalendár prác</h3>
					<ul class="tasks">
						{#each planMonths as c (c.month)}
							<li class:now={c.month === month}>
								<strong>{MONTH_NAMES[c.month - 1]}</strong>
								{#if c.indoor.length}<span
										><i class="t-indoor"></i> predpestuj: {c.indoor.join(', ')}</span
									>{/if}
								{#if c.sow.length}<span><i class="t-sow"></i> sej / sadni: {c.sow.join(', ')}</span
									>{/if}
								{#if c.harvest.length}<span
										><i class="t-harvest"></i> zbieraj: {c.harvest.join(', ')}</span
									>{/if}
							</li>
						{/each}
					</ul>
				</section>
			</div>
			<section class="gear">
				<h3><Icon name="basket" size={18} /> Budeš potrebovať</h3>
				<ul>
					{#each plan.gear as g, i (i)}<li>{g}</li>{/each}
				</ul>
				<a href="/wiki/naradie-na-pestovanie"
					>Náradie, nádoby, voda a semená – podrobne <Icon name="arrow-right" size={14} /></a
				>
			</section>
			{#if input.place === 'zahrada' && plan.families.length > 1}
				<p class="muted rotate">
					<Icon name="info" size={16} /> Na budúci rok posuň výsadby o jeden záhon ďalej, aby na tom istom
					mieste nerástla rovnaká čeľaď ({plan.families.length} čeľadí v pláne). Pôda sa tak nevyčerpá
					a choroby sa nenahromadia.
				</p>
			{/if}
		{:else}
			<p class="empty">
				Na takú plochu a svetlo zatiaľ nemám kombináciu. Skús väčšiu plochu alebo menej náročné
				skúsenosti – a v tieni sa darí aspoň klíčkom a hlive v byte.
			</p>
		{/if}
	</section>

	<section id="plodiny" class="block">
		<h2>Všetky plodiny</h2>
		<div class="chips filters">
			<button class="chip" aria-pressed={placeFilter === ''} onclick={() => (placeFilter = '')}
				>Všade</button
			>
			{#each PLACES as p (p.id)}
				<button
					class="chip"
					aria-pressed={placeFilter === p.id}
					onclick={() => (placeFilter = placeFilter === p.id ? '' : p.id)}>{p.label}</button
				>
			{/each}
			<button class="chip" aria-pressed={onlyNow} onclick={() => (onlyNow = !onlyNow)}
				>Siať {IN_MONTH[month - 1]}</button
			>
			<button class="chip" aria-pressed={onlyEasy} onclick={() => (onlyEasy = !onlyEasy)}
				>Len ľahké</button
			>
		</div>
		<div class="legend-wrap"><GrowMonths sow={[]} harvest={[]} legend /></div>
		<div class="crops">
			{#each crops as g (g.ingredientId)}
				<article class="card crop" id="p-{g.ingredientId}">
					<header>
						<h3><a href="/suroviny/{g.ingredientId}">{g.name}</a></h3>
						<p class="tags">
							<span class="badge leaf">{LEVEL_LABELS[g.level]}</span>
							<span class="badge sky">{g.where.map((w) => PLACE_LABELS[w]).join(' · ')}</span>
							<span class="badge turmeric">{g.sun.map((s) => SUN_LABELS[s]).join(' · ')}</span>
							{#if g.perennial}<span class="badge">trvalka</span>{/if}
						</p>
					</header>
					<GrowMonths indoor={g.indoor} sow={g.sow} harvest={g.harvest} />
					<p>{g.how}</p>
					{#if g.tip}<p class="muted">{g.tip}</p>{/if}
					<p class="small muted">
						{spacing(g)}{g.friends.length ? ` · dobrí susedia: ${names(g.friends)}` : ''}{g.avoid
							.length
							? ` · nesaď k: ${names(g.avoid)}`
							: ''}
					</p>
				</article>
			{:else}
				<p class="muted">Takú plodinu tu nemám – skús iný filter.</p>
			{/each}
		</div>
	</section>

	<section id="nepestuje-sa" class="block">
		<h2>Čo sa u nás pestovať nedá</h2>
		<p class="muted">
			Tieto suroviny kupujeme z teplejších krajín. Pri niektorých sa dá aspoň skúsiť rastlinka v
			byte alebo teplom kúte na juhu.
		</p>
		<div class="not-cols">
			<section>
				<h3>Skúsiť sa dá, úroda je neistá</h3>
				<ul class="not">
					{#each hardHere as n (n.ingredientId)}
						<li>
							<a href="/suroviny/{n.ingredientId}">{n.name}</a>
							<small>{n.origin}</small>
							{#if n.note}<span>{n.note}</span>{/if}
						</li>
					{/each}
				</ul>
			</section>
			<section>
				<h3>U nás nerastie</h3>
				<ul class="not">
					{#each notHere as n (n.ingredientId)}
						<li>
							<a href="/suroviny/{n.ingredientId}">{n.name}</a>
							<small>{n.origin}</small>
							{#if n.note}<span>{n.note}</span>{/if}
						</li>
					{/each}
				</ul>
			</section>
		</div>
	</section>
</div>

<style>
	.page {
		padding-top: 28px;
	}
	.eyebrow {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.lede {
		color: var(--ink-2);
		max-width: 68ch;
	}
	.jump,
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.block {
		margin-top: 36px;
		scroll-margin-top: 80px;
	}
	.block > h2 {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 6px;
	}
	.rec-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
		gap: 12px;
		margin-top: 14px;
	}
	.rec {
		display: grid;
		gap: 6px;
		padding: 16px;
		color: var(--ink);
		text-decoration: none;
		transition: transform 0.25s var(--ease-spring);
	}
	.rec:hover {
		transform: translateY(-3px);
	}
	.rec strong {
		font-family: var(--font-display);
		font-size: 1.15rem;
		color: var(--leaf);
	}
	.planner {
		padding: 22px;
	}
	.form {
		display: grid;
		gap: 16px;
		margin: 18px 0;
	}
	fieldset {
		border: 0;
		margin: 0;
		padding: 0;
	}
	legend,
	.area > span:first-child {
		font-weight: 700;
		margin-bottom: 8px;
	}
	.opts {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
	}
	.opt {
		display: grid;
		gap: 2px;
		padding: 12px;
		border: 1.5px solid var(--line);
		border-radius: var(--radius-sm);
		background: var(--paper);
		color: var(--ink);
		font: inherit;
		text-align: left;
	}
	.opt small {
		color: var(--muted);
	}
	.opt[aria-pressed='true'] {
		border-color: var(--leaf);
		background: var(--leaf-soft);
	}
	.area {
		display: grid;
		gap: 4px;
	}
	.area-input {
		display: flex;
		align-items: center;
		gap: 8px;
		font-weight: 600;
	}
	.area input {
		width: 120px;
		border: 1.5px solid var(--line);
		border-radius: var(--radius-sm);
		background: var(--paper);
		color: var(--ink);
		padding: 10px 12px;
		font: inherit;
	}
	.summary {
		font-size: 1.05rem;
	}
	.combos {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 12px;
	}
	.combo {
		padding: 16px;
		border-radius: var(--radius-sm);
		background: var(--paper);
		border: 1px solid var(--line);
	}
	.combo-head {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: baseline;
		gap: 8px;
	}
	.combo h3 {
		margin: 0;
	}
	.members {
		font-weight: 600;
	}
	.why {
		display: flex;
		gap: 8px;
		align-items: flex-start;
		color: var(--leaf);
		margin-bottom: 0;
	}
	.plan-cols,
	.not-cols {
		display: grid;
		gap: 20px;
		margin-top: 20px;
	}
	@media (min-width: 760px) {
		.plan-cols,
		.not-cols {
			grid-template-columns: 1fr 1fr;
		}
	}
	.shopping,
	.tasks,
	.not {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 6px;
	}
	.shopping li {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: baseline;
	}
	.tasks li {
		display: grid;
		gap: 2px;
		padding: 8px 10px;
		border-radius: 10px;
	}
	.tasks li.now {
		background: var(--leaf-soft);
	}
	.tasks i {
		display: inline-block;
		width: 12px;
		height: 5px;
		border-radius: 3px;
		vertical-align: middle;
		margin-right: 4px;
	}
	.t-indoor {
		background: var(--sky);
	}
	.t-sow {
		background: var(--leaf-2);
	}
	.t-harvest {
		background: var(--turmeric);
	}
	.gear {
		margin-top: 20px;
		padding: 16px;
		border-radius: var(--radius-sm);
		background: var(--paper-2);
	}
	.gear h3 {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0 0 8px;
	}
	.gear ul {
		margin: 0 0 10px;
		padding-left: 1.2em;
	}
	.gear a {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-weight: 600;
	}
	.rotate {
		display: flex;
		gap: 8px;
		align-items: flex-start;
		margin-top: 16px;
	}
	.empty {
		padding: 16px;
		border-radius: var(--radius-sm);
		background: var(--paper-2);
	}
	.filters {
		margin: 12px 0;
	}
	.legend-wrap :global(ol) {
		display: none;
	}
	.crops {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 14px;
	}
	.crop {
		padding: 16px;
		display: grid;
		gap: 10px;
		align-content: start;
		scroll-margin-top: 90px;
	}
	.crop:target {
		outline: 2px solid var(--leaf);
	}
	.crop header h3 {
		margin: 0 0 6px;
	}
	.crop h3 a {
		color: inherit;
		text-decoration: none;
	}
	.crop p {
		margin: 0;
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.small {
		font-size: 0.85rem;
	}
	.not li {
		display: grid;
		gap: 2px;
		padding: 8px 0;
		border-bottom: 1px dashed var(--line);
	}
	.not a {
		font-weight: 700;
	}
	.not small {
		color: var(--muted);
	}
	.not span {
		font-size: 0.9rem;
		color: var(--ink-2);
	}
	@media (max-width: 520px) {
		.opts {
			grid-template-columns: 1fr;
		}
	}
</style>
