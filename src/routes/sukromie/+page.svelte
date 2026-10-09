<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import {
		HANDLED_RETENTION_DAYS,
		PUSH_IDLE_DAYS,
		SEARCH_MISS_DAYS,
		SYNC_IDLE_DAYS
	} from '$lib/retention';

	const CONTACT = 'gabriel@kohut.xyz';
	const UPDATED = '9. 10. 2026';
	const syncYears = SYNC_IDLE_DAYS / 365;
	const handledYears = HANDLED_RETENTION_DAYS / 365;

	const SERVER_DATA = [
		{
			what: 'Synchronizácia',
			detail: 'Len ak ju zapneš: zašifrovaná záloha tvojich dát.',
			why: 'Aby si mal/a dáta na viacerých zariadeniach. Šifruje sa v prehliadači kľúčom z tvojho kódu – bez kódu ju neprečíta nikto, ani správca.',
			kept: `Kým ju nezmažeš (Moje → Zmazať zo servera). Záloha, ktorú ${syncYears} roky neotvorilo žiadne zariadenie, sa zmaže sama.`
		},
		{
			what: 'Spoločný nákup',
			detail: 'Len ak ho vytvoríš: zašifrovaný nákupný zoznam a čo je v ňom odškrtnuté.',
			why: 'Aby ste mohli nakupovať dvaja naraz. Kľúč je len v odkaze, ktorý pošleš – server zoznam neprečíta.',
			kept: `Zoznam, ktorý ${syncYears} roky nikto neotvoril, sa zmaže sám.`
		},
		{
			what: 'Domácnosť',
			detail:
				'Len ak ju založíš alebo sa pripojíš: zašifrovaný spoločný plán, špajza, nákupný zoznam, kto čo kupuje a varí, a členovia – mená, ktoré zadáte, alergie, čo kto neje, „nepálivo“, bezlepková strava, výška, váha, vek, pohlavie, aktivita a cieľ (pre veľkosť porcií), kedy kto nie je doma a recepty, ktoré kto chce. Ak to zapnete: výdavky s poznámkou a kto ich zaplatil, a koľko kto za posledných 7 dní zjedol energie a bielkovín. A krátky záznam, kto čo kedy zmenil.',
			why: 'Aby ste mali doma jeden plán a nákup a recepty vedeli, čo môže jesť každý pri stole. Kľúč je len v pozývacom odkaze – server nevidí mená ani alergie, len šifru.',
			kept: `Kým domácnosť niekto používa. Domácnosť, ktorú ${syncYears} roky nikto neotvoril, sa zmaže sama. Kto odíde, zmizne zo zoznamu členov.`
		},
		{
			what: 'Upozornenia z domácnosti',
			detail:
				'Len ak ich zapneš: push adresa tvojho prehliadača a jej kľúče, náhodné označenie tvojho telefónu v domácnosti a kedy ti prišlo posledné upozornenie. Uložené pri zašifrovanej domácnosti, nie pri tebe.',
			why: 'Aby ti server dal vedieť, že niekto z domácnosti niečo zmenil, keď máš Receptio zavreté. Upozornenie nesie len slovo „domácnosť“ – čo sa zmenilo, si telefón stiahne a dešifruje sám.',
			kept: 'Kým ich nevypneš alebo z domácnosti neodídeš. Adresu, ktorú prehliadač zruší, server zabudne pri ďalšom upozornení.'
		},
		{
			what: 'Pripomienky na vodu a vitamíny',
			detail:
				'Len ak ich zapneš: push adresa tvojho prehliadača, časy pripomienok, časové pásmo, deň, keď máš vodu vypitú, a ktoré dnešné časy vitamínov sú už odškrtnuté.',
			why: 'Aby ti server v nastavený čas poslal upozornenie. Koľko piješ, čo ješ ani aké vitamíny berieš sa na server neposiela – text upozornenia si zloží tvoj prehliadač.',
			kept: `Kým ich nevypneš. Ak Receptio na zariadení ${PUSH_IDLE_DAYS} dní neotvoríš, pripomienky sa zmažú samé.`
		},
		{
			what: 'Ranný prehľad a nedeľný súhrn',
			detail:
				'Len ak ich zapneš: push adresa tvojho prehliadača, časové pásmo a ktorý z dvoch súhrnov chceš.',
			why: 'Aby ti server ráno a v nedeľu poslal prázdne upozornenie. Text (čo variť, čísla za týždeň) si zloží tvoj telefón z údajov, ktoré má u seba.',
			kept: `Kým ich nevypneš. Ak Receptio na zariadení ${PUSH_IDLE_DAYS} dní neotvoríš, zmažú sa samé.`
		},
		{
			what: 'Hľadanie bez výsledku',
			detail:
				'Keď na Receptoch hľadáš niečo, čo nemáme ani bez filtrov: len hľadané slová, koľkokrát ich niekto zadal a kedy naposledy. Bez zariadenia, adresy či čohokoľvek o tebe; čísla, e-maily a iné znaky sa vôbec neodosielajú.',
			why: 'Aby som vedel, aké recepty chýbajú.',
			kept: `${SEARCH_MISS_DAYS} dní od posledného hľadania toho slova.`
		},
		{
			what: 'Lajky',
			detail: 'Náhodné ID zariadenia a recepty, ktoré sa ti páčia.',
			why: 'Aby sa lajk počítal raz a dal sa zrušiť. Súhrnné počty (koľko lajkov má recept, ktoré recepty lajklo za týždeň aspoň 2 ľudí) sú verejné na stránke Dáta, bez ID.',
			kept: 'Kým lajk nezrušíš. ID nie je spojené s menom ani e-mailom.'
		},
		{
			what: 'Návrh receptu',
			detail: 'Text receptu a meno, ak ho vyplníš.',
			why: 'Aby sa recept dal skontrolovať a pridať.',
			kept: `Kým ho nespracujem; spracované návrhy sa priebežne mažú ${handledYears} rok od odoslania.`
		},
		{
			what: 'Spätná väzba k receptu',
			detail: 'Či recept fungoval, hviezdičky a tvoja správa.',
			why: 'Aby sa chyby v receptoch dali opraviť. Počet potvrdení a priemer hviezdičiek vidia pri recepte všetci.',
			kept: `Kým ju nespracujem; spracované správy sa priebežne mažú ${handledYears} rok od odoslania.`
		},
		{
			what: 'IP adresa',
			detail: 'Pri každej požiadavke na server.',
			why: 'Obmedzenie počtu požiadaviek a ochrana pred zneužitím.',
			kept: 'Do databázy sa neukladá. Poskytovateľ hostingu ju má v technických záznamoch niekoľko dní.'
		}
	];
</script>

<Seo
	title="Ochrana súkromia"
	description="Čo Receptio ukladá v tvojom prehliadači a na serveri, prečo, ako dlho a aké máš práva."
/>

<div class="wrap page">
	<header class="rise">
		<p class="eyebrow">Súkromie</p>
		<h1>Ochrana súkromia</h1>
		<p class="lede">
			Receptio nepotrebuje konto, nemá reklamy ani analytiku a nesleduje ťa. Tu je presne, čo sa kde
			ukladá a prečo.
		</p>
		<p class="muted small">Naposledy upravené {UPDATED}.</p>
	</header>

	<div class="prose">
		<h2>Kto za Receptiom stojí</h2>
		<p>
			Správca údajov je <strong>Gabriel Kohut</strong>, kontakt:
			<a href="mailto:{CONTACT}">{CONTACT}</a>. Receptio je nekomerčný projekt, na ktorom nikto
			nezarába.
		</p>

		<h2>Čo ostáva len v tvojom prehliadači</h2>
		<p>
			Špajza, plán jedál, nákupný zoznam, obľúbené, poznámky, história varenia, denník jedla a vody,
			nastavenia, záhradka a poloha pre počasie sa ukladajú v úložisku prehliadača (localStorage) na
			tvojom zariadení. Na server nejdú, pokiaľ nezapneš synchronizáciu. Sú to samotné funkcie,
			ktoré používaš, preto na ne netreba súhlas. Zmažeš ich vymazaním údajov stránky v nastaveniach
			prehliadača; predtým si ich môžeš stiahnuť ako súbor na stránke <a href="/moje">Moje</a>.
		</p>

		<h2>Čo ide na server</h2>
		<div class="stored">
			{#each SERVER_DATA as item (item.what)}
				<section class="item">
					<h3>{item.what}</h3>
					<p>{item.detail}</p>
					<dl>
						<dt>Prečo</dt>
						<dd>{item.why}</dd>
						<dt>Ako dlho</dt>
						<dd>{item.kept}</dd>
					</dl>
				</section>
			{/each}
		</div>

		<h2>Cookies</h2>
		<p>
			Receptio používa jedinú cookie, <code>rid</code>. Vznikne až vtedy, keď dáš prvý lajk, platí
			dva roky a posiela sa len pri lajkoch. Nie je reklamná ani analytická, preto tu nie je lišta
			so súhlasom. Pri odoslaní formulára Cloudflare Turnstile overí, že nie si robot – spracuje
			pritom technické údaje o prehliadači, ale nesleduje ťa medzi stránkami.
		</p>

		<h2>Kto ďalší údaje spracúva</h2>
		<ul>
			<li>
				<strong>Cloudflare, Inc.</strong> – hosting, databáza a ochrana formulárov. Databáza je v západnej
				Európe. Cloudflare spracúva údaje podľa zmluvy o spracúvaní a je zapojený do rámca EÚ – USA na
				ochranu údajov (Data Privacy Framework).
			</li>
			<li>
				<strong>Open-Meteo</strong> – počasie, nadmorská výška a vyhľadanie obce na stránke
				<a href="/pestuj">Pestuj si sám</a>. Keď si nastavíš polohu, prehliadač im pošle priamo
				zadaný názov obce alebo súradnice zaokrúhlené na zhruba kilometer. Nič iné.
			</li>
			<li>
				<strong>Open Food Facts</strong> – otvorená databáza potravín pre pridanie do
				<a href="/spajza">špajze</a> podľa čiarového kódu. Keď kód naskenuješ alebo zadáš, prehliadač
				im pošle priamo len jeho číslo. Obraz z fotoaparátu zostáva v telefóne.
			</li>
		</ul>
		<p>Údaje nikomu nepredávame a nepoužívame ich na reklamu ani profilovanie.</p>

		<h2>Právny základ</h2>
		<ul>
			<li>
				Synchronizácia, spoločný nákup a domácnosť: poskytnutie služby, o ktorú žiadaš (čl. 6 ods. 1
				písm. b GDPR). Alergie, bezlepková strava, telesné údaje a zjedená energia členov domácnosti
				sú údaje o zdraví – zadávate ich dobrovoľne, každý údaj je nepovinný, ostávajú zašifrované a
				správca ich nevidí (čl. 9 ods. 2 písm. a GDPR).
			</li>
			<li>
				Lajky, formuláre a ochrana pred zneužitím: oprávnený záujem prevádzkovať stránku a chrániť
				ju (čl. 6 ods. 1 písm. f GDPR).
			</li>
		</ul>

		<h2>Tvoje práva</h2>
		<p>
			Máš právo na prístup k údajom, ich opravu, vymazanie, obmedzenie spracúvania, prenosnosť a
			právo namietať. Napíš na <a href="mailto:{CONTACT}">{CONTACT}</a>. Synchronizáciu si zmažeš
			sám/sama na stránke <a href="/moje">Moje</a> a lajk zrušíš ďalším kliknutím. Lajky a zálohy nie
			sú spojené s tvojou identitou, preto ich bez ID alebo kódu nevieme priradiť tebe.
		</p>
		<p>
			Ak si myslíš, že s údajmi zaobchádzame zle, môžeš podať sťažnosť na
			<a href="https://dataprotection.gov.sk" rel="noopener">Úrad na ochranu osobných údajov SR</a>.
		</p>

		<h2>Zdravie a potraviny</h2>
		<p>
			Živiny, alergény, lepok a ceny sa počítajú zo surovín a sú orientačné. Pri alergii či celiakii
			vždy skontroluj etiketu konkrétneho výrobku. Články o výžive a suplementoch nie sú lekárska
			rada – pri zdravotných problémoch sa poraď s lekárom.
		</p>

		<h2>Zmeny</h2>
		<p>Keď sa niečo zmení, upravím túto stránku aj dátum hore.</p>
	</div>
</div>

<style>
	.page {
		padding-top: 28px;
		padding-bottom: 40px;
	}
	.lede {
		color: var(--ink-2);
		max-width: 68ch;
	}
	.prose {
		max-width: 76ch;
	}
	.small {
		font-size: 0.85rem;
	}
	.stored {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 12px;
		margin: 12px 0 8px;
	}
	.item {
		padding: 14px 16px;
		border-radius: var(--radius-sm);
		background: var(--card);
		border: 1px solid var(--line);
	}
	.item h3 {
		margin: 0 0 4px;
		font-size: 1.05rem;
	}
	.item p {
		margin: 0 0 8px;
		color: var(--ink-2);
	}
	.item dl {
		display: grid;
		gap: 2px;
		margin: 0;
		font-size: 0.92rem;
	}
	.item dt {
		margin-top: 6px;
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--muted);
	}
	.item dd {
		margin: 0;
	}
</style>
