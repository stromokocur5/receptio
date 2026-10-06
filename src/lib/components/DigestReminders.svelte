<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { localToday } from '$lib/journal';
	import {
		disableDigests,
		enableDigests,
		remindersSupported,
		testDigest,
		updateDigests
	} from '$lib/reminders';
	import { digestReminder } from '$lib/state.svelte';

	let supported = $state(false);
	let busy = $state(false);
	let message = $state('');

	onMount(() => {
		supported = remindersSupported();
		const current = digestReminder.current;
		// Once a day, so the server knows this device still wants them.
		if (supported && current && current.touched !== localToday()) {
			void run(() => updateDigests({ weekly: current.weekly, morning: current.morning }));
		}
	});

	async function run(action: () => Promise<unknown>) {
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

	function toggle(kind: 'weekly' | 'morning', on: boolean) {
		const current = digestReminder.current;
		const kinds = {
			weekly: current?.weekly ?? false,
			morning: current?.morning ?? false,
			[kind]: on
		};
		void run(() =>
			current
				? updateDigests(kinds)
				: kinds.weekly || kinds.morning
					? enableDigests(kinds)
					: Promise.resolve()
		);
	}

	async function sendTest() {
		await run(async () => {
			message = (await testDigest())
				? 'Skúšobný súhrn je na ceste.'
				: 'Súhrny na tomto zariadení už nie sú zapnuté.';
		});
	}
</script>

<section class="card box digests">
	<h2><Icon name="bell" size={24} /> Súhrny do telefónu</h2>
	{#if !supported}
		<p class="muted">
			Tento prehliadač upozornenia nepodporuje. Na iPhone pridaj Receptio na plochu.
		</p>
	{:else}
		<label class="check">
			<input
				type="checkbox"
				checked={digestReminder.current?.morning ?? false}
				disabled={busy}
				onchange={(e) => toggle('morning', e.currentTarget.checked)}
			/>
			<span>
				<strong>Ranný prehľad o 7:00</strong>
				<small class="muted"
					>Čo dnes variť, čo vybrať z mrazničky, čo sa minie a čo z plánu je v akcii.</small
				>
			</span>
		</label>
		<label class="check">
			<input
				type="checkbox"
				checked={digestReminder.current?.weekly ?? false}
				disabled={busy}
				onchange={(e) => toggle('weekly', e.currentTarget.checked)}
			/>
			<span>
				<strong>Nedeľný súhrn týždňa o 18:00</strong>
				<small class="muted">Čo sa uvarilo, rastliny, bielkoviny, peniaze a rozpočet.</small>
			</span>
		</label>
		{#if digestReminder.current}
			<button class="btn ghost small" disabled={busy} onclick={sendTest}>Poslať skúšobný</button>
		{/if}
		{#if message}<p class="small" role="status">{message}</p>{/if}
		<p class="muted small">
			Texty skladá tento telefón z tvojich údajov, na server ide len adresa pre upozornenia. Súhrn
			je aktuálny k poslednému otvoreniu Receptia.
		</p>
	{/if}
</section>

<style>
	.digests {
		margin-bottom: 20px;
		padding: 20px;
	}
	h2 {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 1.4rem;
		margin: 0 0 12px;
	}
	.check {
		display: flex;
		gap: 10px;
		align-items: flex-start;
		margin-bottom: 10px;
	}
	.check span {
		display: grid;
	}
	.small {
		font-size: 0.86rem;
	}
</style>
