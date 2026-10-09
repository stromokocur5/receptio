<script lang="ts">
	import { formatNumber } from '$lib/amounts';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import IngredientExcluder from '$lib/components/IngredientExcluder.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import {
		BODY_GOAL_LABELS,
		PLAN_MEALS,
		memberTargets,
		portionOf,
		type Body,
		type BodyGoal,
		type Member,
		type PlanMeal
	} from '$lib/household';
	import {
		canEdit,
		canRemove,
		claimMember,
		household,
		removeMember,
		shareEaten,
		updateMember
	} from '$lib/household.svelte';
	import MemberCard from '$lib/components/MemberCard.svelte';
	import { localToday } from '$lib/journal';
	import { ACTIVITY_LABELS, ALLERGEN_LABELS, type Activity } from '$lib/nutrition';
	import { journal, settings } from '$lib/state.svelte';
	import { toast } from '$lib/toast.svelte';
	import { ALLERGENS } from '$lib/types';

	let {
		member,
		onclose,
		onremoved
	}: { member: Member; onclose: () => void; onremoved: () => void } = $props();

	const MEAL_NAMES: Record<PlanMeal, string> = {
		ranajky: 'Raňajky',
		obed: 'Obedy',
		vecera: 'Večere'
	};
	const PORTIONS = [
		[0.5, 'Detská (½)'],
		[0.75, 'Menšia (¾)'],
		[1, 'Bežná'],
		[1.25, 'Väčšia (1¼)'],
		[1.5, 'Veľká (1½)']
	] as const;

	const isMe = $derived(household.me === member.id);
	const editable = $derived(canEdit(member));
	const targets = $derived(memberTargets(member.body));
	const away = $derived(member.away);

	function toggleAllergen(allergen: (typeof ALLERGENS)[number]) {
		updateMember(member.id, {
			allergens: member.allergens.includes(allergen)
				? member.allergens.filter((a) => a !== allergen)
				: [...member.allergens, allergen]
		});
	}

	function toggleMeal(meal: PlanMeal) {
		const meals = { ...member.meals, [meal]: !member.meals[meal] };
		// Someone who eats nothing at home is better marked away.
		if (PLAN_MEALS.some((m) => meals[m])) updateMember(member.id, { meals });
	}

	function setBody(change: Partial<Body>) {
		updateMember(member.id, { body: { ...member.body, ...change } });
	}

	/** A number field: empty or out of range clears it. */
	function bodyNumber(key: 'heightCm' | 'weightKg' | 'age', raw: string, min: number, max: number) {
		const v = Number(raw.replace(',', '.'));
		setBody({ [key]: raw.trim() && v >= min && v <= max ? Math.round(v) : null });
	}

	function fromMyProfile() {
		setBody({ weightKg: settings.current.weightKg, activity: journal.current.goals.activity });
	}

	/** A profile this phone may change can be put back; a lost phone's one only by that phone. */
	function remove() {
		const { id, name } = member;
		const undoable = editable;
		removeMember(id);
		onremoved();
		if (undoable) toast(`${name}: odobraté`, () => updateMember(id, { removed: false }));
	}

	function setAway(from: string, to: string | null) {
		if (!from) updateMember(member.id, { away: null });
		else updateMember(member.id, { away: { from, to: to && to >= from ? to : null } });
	}
</script>

{#if !editable}
	<div class="edit">
		<MemberCard {member} />
		<p class="hint">
			Profil si {member.name} vypĺňa vo svojom telefóne – ostatní ho vidia, ale nemenia.
		</p>
		{#if canRemove(member)}
			<p class="hint">Tento telefón sa dva mesiace neozval, preto profil môžeš odobrať.</p>
			<div class="actions">
				<ConfirmButton
					small
					icon="trash"
					confirm="Áno, odobrať"
					why="Ak sa ten telefón ešte ozve, profil sa vráti."
					onconfirm={remove}>Odobrať</ConfirmButton
				>
			</div>
		{/if}
	</div>
{:else}
	<div class="edit">
		{#if !member.owner}
			<p class="hint">
				Tento profil môže upraviť ktokoľvek v domácnosti – hodí sa pre dieťa alebo niekoho bez
				telefónu.
			</p>
		{/if}
		<label class="name-field">
			Meno
			<input
				class="input"
				value={member.name}
				maxlength="40"
				onchange={(e) =>
					e.currentTarget.value.trim() &&
					updateMember(member.id, { name: e.currentTarget.value.trim() })}
			/>
		</label>

		<fieldset>
			<legend>Kedy je doma</legend>
			<div class="chips">
				{#each PLAN_MEALS as meal (meal)}
					<button class="chip" aria-pressed={member.meals[meal]} onclick={() => toggleMeal(meal)}
						>{MEAL_NAMES[meal]}</button
					>
				{/each}
			</div>
			<p class="hint">Plán varí porcie len pre tých, čo pri danom jedle sedia doma.</p>
		</fieldset>

		<fieldset>
			<legend>Preč (dovolenka, služobka)</legend>
			<div class="dates">
				<label>
					od
					<input
						class="input"
						type="date"
						value={away?.from ?? ''}
						onchange={(e) => setAway(e.currentTarget.value, away?.to ?? null)}
					/>
				</label>
				<label>
					do
					<input
						class="input"
						type="date"
						value={away?.to ?? ''}
						min={away?.from ?? localToday()}
						disabled={!away}
						onchange={(e) => setAway(away?.from ?? localToday(), e.currentTarget.value || null)}
					/>
				</label>
				{#if away}
					<button class="btn ghost" onclick={() => setAway('', null)}>Už je doma</button>
				{/if}
			</div>
			{#if away && !away.to}<p class="hint">Bez dátumu „do“ – kým nepovieš, že je späť.</p>{/if}
		</fieldset>

		<fieldset>
			<legend>Porcia</legend>
			<select
				class="input"
				value={member.portion ?? 'auto'}
				onchange={(e) =>
					updateMember(member.id, {
						portion: e.currentTarget.value === 'auto' ? null : Number(e.currentTarget.value)
					})}
			>
				<option value="auto"
					>Podľa tela{targets.portion
						? ` (${formatNumber(targets.portion, 2)}×)`
						: ' – zatiaľ bežná'}</option
				>
				{#each PORTIONS as [value, label] (value)}<option {value}>{label}</option>{/each}
			</select>
		</fieldset>

		<fieldset>
			<legend>Telo a ciele <span class="badge">nepovinné</span></legend>
			<div class="body">
				<label>
					Výška
					<span class="unit"
						><input
							class="input"
							inputmode="numeric"
							placeholder="—"
							value={member.body.heightCm ?? ''}
							onchange={(e) => bodyNumber('heightCm', e.currentTarget.value, 50, 250)}
						/> cm</span
					>
				</label>
				<label>
					Váha
					<span class="unit"
						><input
							class="input"
							inputmode="numeric"
							placeholder="—"
							value={member.body.weightKg ?? ''}
							onchange={(e) => bodyNumber('weightKg', e.currentTarget.value, 10, 250)}
						/> kg</span
					>
				</label>
				<label>
					Vek
					<span class="unit"
						><input
							class="input"
							inputmode="numeric"
							placeholder="—"
							value={member.body.age ?? ''}
							onchange={(e) => bodyNumber('age', e.currentTarget.value, 1, 110)}
						/> r.</span
					>
				</label>
				<label>
					Pohlavie
					<select
						class="input"
						value={member.body.sex ?? ''}
						onchange={(e) => setBody({ sex: (e.currentTarget.value || null) as Body['sex'] })}
					>
						<option value="">Neuvádzam</option>
						<option value="f">Žena</option>
						<option value="m">Muž</option>
					</select>
				</label>
				<label>
					Pohyb
					<select
						class="input"
						value={member.body.activity}
						onchange={(e) => setBody({ activity: e.currentTarget.value as Activity })}
					>
						{#each Object.entries(ACTIVITY_LABELS) as [value, label] (value)}<option {value}
								>{label}</option
							>{/each}
					</select>
				</label>
				<label>
					Cieľ
					<select
						class="input"
						value={member.body.goal}
						onchange={(e) => setBody({ goal: e.currentTarget.value as BodyGoal })}
					>
						{#each Object.entries(BODY_GOAL_LABELS) as [value, label] (value)}<option {value}
								>{label}</option
							>{/each}
					</select>
				</label>
			</div>
			{#if targets.kcal || targets.protein}
				<p class="targets">
					Denne asi
					{#if targets.kcal}<strong>{formatNumber(targets.kcal, 0)} kcal</strong
						>{/if}{#if targets.kcal && targets.protein}{' a '}{/if}{#if targets.protein}<strong
							>{formatNumber(targets.protein, 0)} g bielkovín</strong
						>{/if}
					· porcia {formatNumber(portionOf(member), 2)}×
				</p>
			{/if}
			<p class="hint">
				Vidí to každý v domácnosti; na server ide len šifra. Energia je odhad (Mifflin-St Jeor),
				deťom do 13 rokov stačí vek.
			</p>
			{#if isMe && settings.current.weightKg && member.body.weightKg !== settings.current.weightKg}
				<button class="btn ghost small from-mine" onclick={fromMyProfile}
					>Prevziať váhu a pohyb z môjho profilu</button
				>
			{/if}
		</fieldset>

		<fieldset>
			<legend>Alergie</legend>
			<div class="chips">
				{#each ALLERGENS as allergen (allergen)}
					<button
						class="chip"
						aria-pressed={member.allergens.includes(allergen)}
						onclick={() => toggleAllergen(allergen)}>{ALLERGEN_LABELS[allergen]}</button
					>
				{/each}
			</div>
		</fieldset>
		<fieldset>
			<legend>Strava</legend>
			<div class="chips">
				<button
					class="chip"
					aria-pressed={member.mild}
					onclick={() => updateMember(member.id, { mild: !member.mild })}
					><Icon name="chili" size={16} /> Nepálivo</button
				>
				<button
					class="chip"
					aria-pressed={member.glutenFree}
					onclick={() => updateMember(member.id, { glutenFree: !member.glutenFree })}
					><Icon name="wheat" size={16} /> Bezlepkovo</button
				>
			</div>
		</fieldset>
		<fieldset>
			<legend>Čo neje alebo nechce jesť</legend>
			<IngredientExcluder
				selected={member.avoid}
				onchange={(ids) => updateMember(member.id, { avoid: ids })}
				fieldLabel={`Čo ${member.name} neje`}
				prefix="neje"
				hint="Recepty s týmito surovinami nebude plán pre domácnosť ponúkať. Celá skupina: „cícer“ vylúči suchý aj sterilizovaný."
			/>
		</fieldset>
		{#if member.owner && isMe}
			<label class="check">
				<input
					type="checkbox"
					checked={!!member.eaten}
					onchange={(e) => shareEaten(e.currentTarget.checked ? [] : null)}
				/>
				<span
					>Ukázať ostatným energiu a bielkoviny, ktoré mám za posledných 7 dní v
					<a href="/moje#dennik">denníku</a></span
				>
			</label>
		{/if}
		<!-- The editor is long: closing it shouldn't need a scroll back up. -->
		<div class="actions">
			<button class="btn leaf" onclick={onclose}><Icon name="check" size={18} /> Hotovo</button>
			{#if !member.owner && !household.me}
				<button class="btn ghost" onclick={() => claimMember(member.id)}>Toto som ja</button>
			{/if}
			{#if !member.owner || !isMe}
				<button class="btn danger push" onclick={remove}
					><Icon name="trash" size={18} /> Odobrať</button
				>
			{/if}
		</div>
	</div>
{/if}

<style>
	.edit {
		display: grid;
		gap: var(--sp-4);
		margin-top: var(--sp-3);
		padding-top: var(--sp-3);
		border-top: 1px dashed var(--line);
	}
	.edit > .hint {
		margin: 0;
	}
	.name-field,
	.body label,
	.dates label {
		display: grid;
		gap: 4px;
		font-weight: 650;
		font-size: var(--fs-sm);
	}
	.name-field {
		max-width: 420px;
	}
	/* Labels are small; the boxes keep body size (smaller text zooms the page on iPhone). */
	.input {
		min-width: 0;
		font-size: var(--fs-base);
	}
	fieldset {
		border: 0;
		padding: 0;
		margin: 0;
		min-width: 0;
	}
	legend {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: 0;
		margin-bottom: var(--sp-2);
		font-weight: 650;
	}
	.dates {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 10px;
	}
	.body {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
		gap: 10px;
	}
	.unit {
		display: flex;
		align-items: center;
		gap: 6px;
		font-weight: 500;
	}
	.unit .input {
		width: 100%;
	}
	.targets {
		margin: 10px 0 0;
	}
	.from-mine {
		margin-top: var(--sp-2);
	}
	.check {
		padding: 0;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: var(--sp-2);
	}
	/* Removing sits apart from "done", so it isn't hit by accident. */
	.push {
		margin-left: auto;
	}
</style>
