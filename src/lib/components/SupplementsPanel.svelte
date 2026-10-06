<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import {
		addSupplement,
		EMPTY_DAY,
		MAX_SUPPLEMENTS,
		openSupplementTimes,
		SUPPLEMENT_PRESETS,
		toggleTaken,
		withDay
	} from '$lib/journal';
	import { minutesToTime } from '$lib/push';
	import {
		disableSupplementReminders,
		enableSupplementReminders,
		rememberSupplementsToday,
		remindersSupported,
		testSupplementReminder,
		updateSupplementReminders
	} from '$lib/reminders';
	import { journal, supplementReminder, waterReminder } from '$lib/state.svelte';
	import { onMount } from 'svelte';

	/** The day shown in the diary; reminders always follow today. */
	let { date, today }: { date: string; today: string } = $props();

	const TIMES = Array.from({ length: 48 }, (_, i) => i * 30).filter((m) => m >= 5 * 60);

	const supplements = $derived(journal.current.supplements);
	const day = $derived(journal.current.days[date] ?? EMPTY_DAY);
	const todayDay = $derived(journal.current.days[today] ?? EMPTY_DAY);
	const presets = $derived(
		SUPPLEMENT_PRESETS.filter((p) => !supplements.some((s) => s.name === p.name))
	);
	const times = $derived([...new Set(supplements.map((s) => s.time))].sort((a, b) => a - b));
	/** Times whose supplements were all taken today: the server skips those reminders. */
	const doneTimes = $derived.by(() => {
		const open = openSupplementTimes(supplements, todayDay);
		return times.filter((t) => !open.includes(t));
	});

	let supported = $state(false);
	let busy = $state(false);
	let pending = $state<'enable' | 'test' | null>(null);
	let message = $state('');
	let testNote = $state('');
	let customName = $state('');
	let customTime = $state(8 * 60);
	let adding = $state(false);

	onMount(() => {
		supported = remindersSupported();
	});

	// The service worker names what's left to take; the server learns only times and tick-offs.
	$effect(() => {
		const taken = new Set(todayDay.taken ?? []);
		const group = (list: typeof supplements) => {
			const byTime: Record<number, string[]> = {};
			for (const s of list) (byTime[s.time] ??= []).push(s.name);
			return byTime;
		};
		rememberSupplementsToday({
			date: today,
			open: group(supplements.filter((s) => !taken.has(s.id))),
			all: group(supplements),
			water: Boolean(waterReminder.current)
		});
	});

	$effect(() => {
		const state = { times, doneDate: today, doneTimes };
		if (!supplementReminder.current || !supported) return;
		const timer = setTimeout(() => void run(() => updateSupplementReminders(state)), 800);
		return () => clearTimeout(timer);
	});

	async function run(action: () => Promise<void>, label: typeof pending = null) {
		busy = true;
		pending = label;
		message = '';
		try {
			await action();
		} catch (err) {
			message = err instanceof Error ? err.message : 'Niečo sa pokazilo.';
		} finally {
			busy = false;
			pending = null;
		}
	}

	function add(name: string, time: number) {
		journal.current = addSupplement(journal.current, name, time);
	}

	function addCustom(event: SubmitEvent) {
		event.preventDefault();
		if (!customName.trim()) return;
		add(customName, customTime);
		customName = '';
		adding = false;
	}

	function setTime(id: string, time: number) {
		journal.current = {
			...journal.current,
			supplements: supplements.map((s) => (s.id === id ? { ...s, time } : s))
		};
	}

	function remove(id: string) {
		journal.current = {
			...journal.current,
			supplements: supplements.filter((s) => s.id !== id)
		};
	}

	function toggle(id: string) {
		journal.current = withDay(journal.current, date, (d) => toggleTaken(d, id), today);
	}

	async function sendTest() {
		testNote = '';
		if (Notification.permission !== 'granted') {
			message =
				'Prehliadač má upozornenia pre Receptio vypnuté. Povoľ ich v nastaveniach stránky a skús znova.';
			return;
		}
		if (await testSupplementReminder())
			testNote =
				'Odoslané. Ak do minúty nepríde, blokuje ju telefón: povolenie upozornení, úspora batérie alebo režim Nerušiť.';
	}
</script>

<div class="supplements" id="vitaminy">
	<h3><Icon name="pill" size={18} /> Vitamíny a doplnky</h3>

	{#if supplements.length}
		<ul class="list">
			{#each supplements as s (s.id)}
				{@const taken = (day.taken ?? []).includes(s.id)}
				<li class:taken>
					<label class="tick">
						<input type="checkbox" checked={taken} onchange={() => toggle(s.id)} />
						<span>{s.name}</span>
					</label>
					<label>
						<span class="sr-only">Kedy: {s.name}</span>
						<select value={s.time} onchange={(e) => setTime(s.id, Number(e.currentTarget.value))}>
							{#each TIMES as m (m)}<option value={m}>{minutesToTime(m)}</option>{/each}
						</select>
					</label>
					<button class="icon-btn" aria-label="Odstrániť: {s.name}" onclick={() => remove(s.id)}>
						<Icon name="x" size={15} />
					</button>
				</li>
			{/each}
		</ul>
		{#if supplements.every((s) => (day.taken ?? []).includes(s.id))}
			<p class="done small">
				<Icon name="check" size={15} /> Na {date === today ? 'dnes' : 'tento deň'} všetko.
			</p>
		{/if}
	{:else}
		<p class="muted small">
			Zapíš si, čo berieš, a odškrtávaj to. Na rastlinnej strave je nevyhnutný
			<a href="/wiki/b12">vitamín B12</a>, v zime aj <a href="/wiki/vitamin-d">vitamín D</a>.
		</p>
	{/if}

	{#if supplements.length < MAX_SUPPLEMENTS}
		{#if presets.length}
			<div class="chips" role="group" aria-label="Pridať doplnok">
				{#each presets as p (p.name)}
					<button class="chip" title={p.why} onclick={() => add(p.name, p.time)}>
						<Icon name="plus" size={13} />
						{p.name} <small>{p.why}</small>
					</button>
				{/each}
				<button class="chip" onclick={() => (adding = !adding)} aria-expanded={adding}>
					<Icon name="pencil" size={13} /> Iný
				</button>
			</div>
		{/if}
		{#if adding || !presets.length}
			<form class="custom" onsubmit={addCustom}>
				<label class="field small-field">
					<span class="sr-only">Názov</span>
					<input bind:value={customName} maxlength="40" placeholder="Napr. horčík" required />
				</label>
				<label class="field small-field">
					<span class="sr-only">Kedy</span>
					<select bind:value={customTime}>
						{#each TIMES as m (m)}<option value={m}>{minutesToTime(m)}</option>{/each}
					</select>
				</label>
				<button class="btn leaf small" type="submit">Pridať</button>
			</form>
		{/if}
	{/if}

	{#if supplements.length}
		<div class="reminders">
			{#if !supported}
				<p class="muted small">
					<Icon name="bell" size={15} /> Pripomienky tento prehliadač nevie. Na iPhone si Receptio najprv
					pridaj na plochu (Zdieľať → Pridať na plochu).
				</p>
			{:else if !supplementReminder.current}
				<button
					class="btn ghost small"
					disabled={busy}
					aria-busy={pending === 'enable'}
					onclick={() =>
						run(() => enableSupplementReminders({ times, doneDate: today, doneTimes }), 'enable')}
				>
					<Icon name="bell" size={16} />
					{pending === 'enable' ? 'Zapínam…' : 'Pripomínať mi ich'}
				</button>
			{:else}
				<p class="small">
					<Icon name="bell" size={15} /> Pripomeniem o {times.map(minutesToTime).join(', ')}, ak ich
					ešte nemáš odškrtnuté.
				</p>
				<div class="actions">
					<button class="btn ghost small" disabled={busy} onclick={() => run(sendTest, 'test')}>
						{pending === 'test' ? 'Posielam…' : 'Vyskúšať'}
					</button>
					<button
						class="btn ghost small"
						disabled={busy}
						onclick={() => run(disableSupplementReminders)}
					>
						Vypnúť pripomienky
					</button>
				</div>
				{#if testNote}<p class="muted small" role="status">{testNote}</p>{/if}
			{/if}
			{#if message}<p class="error small" role="alert">{message}</p>{/if}
			<p class="muted small">
				Na server ide len čas pripomienky. Čo berieš, ostáva v tvojom zariadení.
			</p>
		</div>
	{/if}
</div>

<style>
	.supplements {
		margin-top: 18px;
	}
	h3 {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 1.05rem;
		margin: 0 0 10px;
	}
	.list {
		list-style: none;
		margin: 0 0 10px;
		padding: 0;
	}
	.list li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto auto;
		align-items: center;
		gap: 8px;
		padding: 6px 0;
		border-bottom: 1px dashed var(--line);
	}
	.tick {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
		overflow-wrap: anywhere;
		font-weight: 600;
	}
	.tick input {
		width: 20px;
		height: 20px;
		flex: none;
		accent-color: var(--leaf);
	}
	.taken .tick span {
		text-decoration: line-through;
		color: var(--muted);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-bottom: 10px;
	}
	.chips small {
		color: var(--muted);
		margin-left: 2px;
	}
	.custom {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
		margin-bottom: 10px;
	}
	.custom .field:first-child {
		flex: 1 1 12em;
	}
	.done {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--leaf);
		margin: 0 0 10px;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.reminders p {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
	}
	.error {
		color: var(--tomato);
	}
	.small {
		font-size: 0.84rem;
	}
</style>
