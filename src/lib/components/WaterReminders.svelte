<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { localToday } from '$lib/journal';
	import {
		DEFAULT_SCHEDULE,
		minutesToTime,
		REMINDER_EVERY_OPTIONS,
		type ReminderSchedule
	} from '$lib/push';
	import {
		disableReminders,
		enableReminders,
		rememberWaterToday,
		remindersSupported,
		testReminder,
		updateReminders
	} from '$lib/reminders';
	import { waterReminder } from '$lib/state.svelte';
	import { onMount } from 'svelte';

	let { todayMl, goalMl }: { todayMl: number; goalMl: number } = $props();

	const TIMES = Array.from({ length: 48 }, (_, i) => i * 30).filter((m) => m >= 5 * 60);
	const EVERY_LABELS: Record<number, string> = {
		60: 'každú hodinu',
		90: 'každú 1,5 hodiny',
		120: 'každé 2 hodiny',
		180: 'každé 3 hodiny'
	};

	let supported = $state(false);
	let busy = $state(false);
	let message = $state('');
	let testNote = $state('');

	onMount(() => {
		supported = remindersSupported();
		const current = waterReminder.current;
		// Once a day, so the server knows this device still uses reminders.
		if (supported && current && current.touched !== localToday())
			void run(() => updateReminders({}));
	});

	$effect(() => {
		if (!waterReminder.current) return;
		rememberWaterToday({ date: localToday(), ml: todayMl, goalMl });
	});

	// Goal met: no more reminders today. Back under it (a glass taken off): reminders again.
	$effect(() => {
		const current = waterReminder.current;
		if (!current || busy) return;
		const today = localToday();
		const met = todayMl >= goalMl;
		if (met && current.skipDate !== today) void run(() => updateReminders({ skipDate: today }));
		else if (!met && current.skipDate === today)
			void run(() => updateReminders({ skipDate: null }));
	});

	async function run(action: () => Promise<void>) {
		busy = true;
		message = '';
		try {
			await action();
		} catch (err) {
			message = err instanceof Error ? err.message : 'Niečo sa pokazilo.';
		} finally {
			busy = false;
		}
	}

	async function sendTest() {
		testNote = '';
		if (Notification.permission !== 'granted') {
			message =
				'Prehliadač má upozornenia pre Receptio vypnuté. Povoľ ich v nastaveniach stránky a skús znova.';
			return;
		}
		if (await testReminder())
			testNote =
				'Odoslané. Ak do minúty nepríde, blokuje ju telefón: povolenie upozornení pre prehliadač, úspora batérie alebo režim Nerušiť.';
	}

	function setSchedule(patch: Partial<ReminderSchedule>) {
		const current = waterReminder.current;
		if (!current) return;
		const schedule = { ...current.schedule, ...patch };
		if (schedule.from >= schedule.to) {
			message = 'Prvá pripomienka musí byť skôr ako posledná.';
			return;
		}
		void run(() => updateReminders({ schedule }));
	}
</script>

<div class="reminders">
	{#if !supported}
		<p class="muted small">
			<Icon name="bell" size={15} /> Pripomienky tento prehliadač nevie. Na iPhone si Receptio najprv
			pridaj na plochu (Zdieľať → Pridať na plochu) a otvor ho odtiaľ.
		</p>
	{:else if !waterReminder.current}
		<button
			class="btn ghost small"
			disabled={busy}
			onclick={() => run(() => enableReminders(DEFAULT_SCHEDULE))}
		>
			<Icon name="bell" size={16} /> Pripomínať mi piť
		</button>
	{:else}
		{@const s = waterReminder.current.schedule}
		<div class="row">
			<Icon name="bell" size={16} />
			<label>
				<span class="sr-only">Prvá pripomienka</span>
				<select
					value={s.from}
					disabled={busy}
					onchange={(e) => setSchedule({ from: Number(e.currentTarget.value) })}
				>
					{#each TIMES as m (m)}<option value={m}>od {minutesToTime(m)}</option>{/each}
				</select>
			</label>
			<label>
				<span class="sr-only">Posledná pripomienka</span>
				<select
					value={s.to}
					disabled={busy}
					onchange={(e) => setSchedule({ to: Number(e.currentTarget.value) })}
				>
					{#each TIMES as m (m)}<option value={m}>do {minutesToTime(m)}</option>{/each}
				</select>
			</label>
			<label>
				<span class="sr-only">Ako často</span>
				<select
					value={s.every}
					disabled={busy}
					onchange={(e) =>
						setSchedule({
							every: Number(e.currentTarget.value) as ReminderSchedule['every']
						})}
				>
					{#each REMINDER_EVERY_OPTIONS as every (every)}
						<option value={every}>{EVERY_LABELS[every]}</option>
					{/each}
				</select>
			</label>
			<button class="btn ghost small" disabled={busy} onclick={() => run(sendTest)}>
				Vyskúšať
			</button>
			<button class="btn ghost small" disabled={busy} onclick={() => run(disableReminders)}>
				Vypnúť
			</button>
		</div>
		<p class="muted small">
			{waterReminder.current.skipDate === localToday()
				? 'Dnes máš vypité, ďalšia pripomienka príde zajtra.'
				: 'Keď splníš denný cieľ, na zvyšok dňa stíchnu.'}
		</p>
	{/if}
	{#if testNote}<p class="muted small" role="status">{testNote}</p>{/if}
	{#if message}<p class="msg small" role="alert">{message}</p>{/if}
</div>

<style>
	.reminders {
		margin-top: 12px;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}
	select {
		padding: 6px 10px;
		border: 1.5px solid var(--line);
		border-radius: 10px;
		background: var(--card, var(--paper));
		color: var(--ink);
		font: inherit;
		font-size: 0.88rem;
	}
	p {
		margin: 8px 0 0;
	}
	.small {
		font-size: 0.84rem;
	}
	.msg {
		padding: 6px 10px;
		border-radius: 10px;
		background: var(--tomato-soft);
	}
</style>
