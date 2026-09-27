# Receptio

Komunitné vegánske a bezlepkové recepty so živinami, cenami, špajzou, týždenným plánom a nákupným zoznamom.
Zadarmo, bez reklám a bez registrácie. SvelteKit na Cloudflare Workers.

## Spustenie

```sh
pnpm install
pnpm exec wrangler d1 migrations apply receptio --local   # lokálna DB pre lajky
pnpm dev                                                  # http://localhost:5173
```

| Príkaz          | Čo robí                                                             |
| --------------- | ------------------------------------------------------------------- |
| `pnpm test`     | unit testy + validácia celého obsahu (neznáme suroviny, jednotky …) |
| `pnpm check`    | typecheck                                                           |
| `pnpm build`    | produkčný build (všetky stránky sa prerenderujú)                    |
| `pnpm preview`  | build v reálnom Workers runtime (`wrangler dev`)                    |
| `pnpm test:e2e` | testy v prehliadači (Playwright): sprievodca, plán, záhradka, sync  |

## Ako to funguje

- **Obsah je v gite** (`content/`), nie v databáze. Recepty pridáva len správca, takže netreba login ani admin.
- **Čísla sa počítajú, nepíšu.** Recept odkazuje na suroviny z `content/ingredients.yaml`. Build z nich
  vypočíta živiny na porciu, bezlepkovosť (vrátane „po zámene“ napr. sójovka → tamari), alergény, cenu
  a odkazy na návody zo sekcie Základy.
- **Špajza, plán a nákupný zoznam** sú v `localStorage` prehliadača, žiadne kontá.
- **Špajza, plán, história varenia, obľúbené a poznámky** sa dajú zálohovať a obnoviť na stránke Moje (JSON súbor).
- **Synchronizácia bez účtu:** prehliadač vytvorí náhodný kód na obnovenie (20 znakov), odvodí z neho ID
  záznamu, zapisovací token a AES kľúč a na server (`/api/sync/[id]`, tabuľka `sync`) posiela len šifru.
  Druhé zariadenie sa pripojí tým istým kódom. Bez kódu dáta neprečíta nikto, ani správca.
- **Sprievodca pri prvej návšteve** (`Onboarding.svelte`) najprv ponúkne synchronizáciu, potom ukáže, ako appka
  funguje (recepty → plán → nákup → špajza), a nastaví počet ľudí. Nezobrazí sa tým, kto prišiel cez zdieľaný
  odkaz; znova sa spúšťa na stránke Moje.
- **Nákupný zoznam sa zdieľa odkazom** `/zoznam#…` – plán a zoznam sú vo fragmente URL, na server nejdú.
- **Serverové veci (D1):** anonymné lajky (náhodné ID v httpOnly cookie), návrhy receptov, spätná väzba
  a šifrované zálohy synchronizácie. Všetky API majú limit na IP (Workers Rate Limiting).
- **Pestuj si sám** (`/pestuj`): plodiny a zmiešané výsadby v `content/pestovanie.yaml`, plánovač podľa miesta,
  plochy, svetla a receptov, kresliaci editor záhonov (políčka 30 × 30 cm, upozornenia na zlých susedov
  a striedanie plodín), denník s úlohami na mesiac a zápisom úrody (pribudne do špajze). Poloha posúva
  kalendáre podľa nadmorskej výšky, počasie a mrazy sú z Open-Meteo – z prehliadača odchádzajú len súradnice.
  Plán záhradky sa zdieľa odkazom `/pestuj#zahradka=…`.
- Všetky stránky sa prerenderujú, Worker obsluhuje iba `/api/*`. Náhľadové obrázky `/og/*.png` sa kreslia pri
  builde (resvg), do Workera sa nedostanú.
- **Offline:** service worker drží aplikáciu, plán, špajzu a naposledy otvorené recepty.

```
content/
  ingredients.yaml   suroviny: živiny na 100 g, jednotky, lepok, alergény, odhad ceny, návody
  recipes/*.yaml     recepty (id = názov súboru)
  cuisines.yaml      kuchyne sveta + na čo si dať pozor
  equipment.yaml     kuchynské vybavenie, náhrady a slová, podľa ktorých ho recept rozpozná
  pestovanie.yaml    plodiny (kalendár, rozostupy, susedia, úroda) a zmiešané výsadby
  prices.yaml        reálne ceny z obchodov (produkt, balenie, cena, dátum, akcia)
  wiki/*.md          základy varenia, suplementy, návody
src/lib/
  amounts.ts nutrition.ts pricing.ts pantry.ts shopping.ts   čistá doménová logika (testovaná)
  garden.ts weather.ts season.ts                             pestovanie, záhony, počasie a sezóna
  sync.svelte.ts                                             šifrovaná synchronizácia bez účtu
  server/content.ts                                          načítanie + validácia + výpočty
  art.ts, components/PlateArt.svelte                         generované ilustrácie tanierov
  components/Icon.svelte                                     vlastná sada SVG ikon
```

## Pridanie receptu

Nový súbor `content/recipes/<id-bez-diakritiky>.yaml`:

```yaml
title: Názov
description: Jedna-dve vety.
cuisine: indicka-sever # id z cuisines.yaml
meals: [obed, vecera] # ranajky | obed | vecera | snack | dezert
time: 35 # celkový čas v minútach
active: 15 # z toho aktívna práca
servings: 4
difficulty: 1 # 1–3
tags: [meal-prep]
ingredients:
  - cicer-sterilizovany: 2 ks # jednotky: g kg ml l ks pl čl hrnček štipka
  - cibula: 1 ks | nadrobno # za | je poznámka
  - sol: podľa chuti
steps:
  - Prvý krok.
tips:
  - Voliteľný tip.
```

Voliteľné polia:

```yaml
ahead: Cícer namoč cez noc. # príprava vopred, nepočíta sa do time
yields: cca 400 g tofu # výťažok (DIY recepty)
nutrition: false # nezobrazovať živiny (výsledok sa sceďuje, napr. sójové mlieko)
gf_swap: false # nevytvárať automatickú bezlepkovú verziu (pizza, halušky)
related: [domace-tofu] # odkazy na iné recepty
howto: [vyprazanie] # návody navyše k tým zo surovín
equipment: [teplomer] # vybavenie, ktoré z postupu nevyčítať (inak sa rozpozná samo)
no_equipment: [panvica] # omylom rozpoznané vybavenie
variants:
  - name: Bez náhrad
    description: Čo robiť inak.
    replace:
      - { from: rastlinna-smotana, to: kesu, amount: 60 g | namočené }
      - { from: rastlinne-maslo, to: olej } # bez amount = rovnaké množstvo
    add:
      - voda: 3/4 hrnček
    remove: [sojovy-jogurt]
```

Množstvo s `~` na začiatku (`~6 hrnček`) sa kúpi, ale nezje (vývar na dusenie) – nepočíta sa do živín.
Bezlepková verzia sa vytvorí sama, ak má každá lepková surovina v `ingredients.yaml` `gf_alternative`.

Potom `pnpm test`. Ak surovina neexistuje, jednotka nedáva zmysel alebo chýba hmotnosť pre `ks`, test povie kde.
Nová surovina patrí do `content/ingredients.yaml` (hodnoty na 100 g, ideálne z USDA FoodData Central).

## Ceny

`content/prices.yaml`, každý záznam je konkrétny produkt v konkrétnom obchode a dni. Porovnáva sa cena za kg,
bežná cena po 60 dňoch zastará, akciová platí do `sale_until`. Kým pre surovinu nie je reálna cena, použije sa
odhad z `ingredients.yaml` a appka ho označí.

Základné potraviny sa sťahujú z [cenyslovensko.sk](https://www.cenyslovensko.sk/) (porovnávač MF SR, reťazce
tam ceny posielajú denne zo zákona): `pnpm prices:sync` prepíše `content/prices-cenyslovensko.yaml` podľa
mapovania v `content/cenyslovensko.yaml`. Porovnávač sleduje len ~60 druhov potravín, ostatné ceny sú ručné.
Obnovuje sa samo každé ráno cez GitHub Action `.github/workflows/prices.yml` (5:30 UTC, dá sa spustiť
aj ručne v záložke Actions): stiahne ceny, spustí testy a build a pri zmene commitne a pushne, čo spustí
nasadenie. Každý beh pridá riadky do `content/price-history.csv` (história cien na neskoršie grafy).

Ručne: `pnpm prices:sync` a commitni `content/prices-cenyslovensko.yaml`.

## Návrhy receptov

Formulár `/navrhni` ukladá do D1 tabuľky `suggestions`. Nič sa nezverejní samo – prečítaj a prepíš do YAML:

```sh
pnpm exec wrangler d1 execute receptio --remote --command "SELECT * FROM suggestions WHERE status = 'new'"
pnpm exec wrangler d1 execute receptio --remote --command "UPDATE suggestions SET status = 'added' WHERE id = 1"
```

## Admin panel

`https://receptio.kohut.xyz/admin` – spätná väzba, návrhy receptov a lajky, s tlačidlami „vybavené“.
Chráni ho **Cloudflare Access** (aplikácia „Receptio admin“, prihlásenie kódom z mailu, povolené e-maily
v `ADMIN_EMAILS` a v pravidle aplikácie). Worker navyše overuje token Access (`src/lib/server/access.ts`),
takže sa naň nedá dostať ani cez workers.dev. V `pnpm dev` je otvorený bez prihlásenia.

## Spätná väzba k receptom

Tlačidlá „Funguje, ako je napísané“ a „Niečo nesedí“ pri recepte ukladajú do tabuľky `feedback`. Recept
s potvrdeniami označíš ako vyskúšaný poľom `tested: 2026-10-01` v jeho YAML.

```sh
pnpm exec wrangler d1 execute receptio --remote --command "SELECT recipe_id, kind, message FROM feedback WHERE status = 'new'"
pnpm exec wrangler d1 execute receptio --remote --command "SELECT recipe_id, COUNT(*) FROM feedback WHERE kind = 'worked' GROUP BY recipe_id"
```

## Ochrana proti botom

Návrhy aj spätnú väzbu chráni **Cloudflare Turnstile** (widget „Receptio formuláre“, neviditeľný – úlohu
ukáže len podozrivým). Sitekey je v `src/lib/turnstile.ts`, tajný kľúč je secret Workera `TURNSTILE_SECRET`,
povolené hostnames v `TURNSTILE_HOSTNAMES` (`wrangler.jsonc`). Server overuje každý token cez Siteverify
(`src/lib/server/turnstile.ts`) a pri chybe odmietne. Lokálne treba v `.dev.vars` testovací kľúč
`TURNSTILE_SECRET=1x0000000000000000000000000000000AA`. Lajky chráni len rate limit.

## Nasadenie (Cloudflare)

1. `pnpm exec wrangler d1 create receptio` a vrátené `database_id` vlož do `wrangler.jsonc`.
2. `pnpm exec wrangler d1 migrations apply receptio --remote`
3. `pnpm build && pnpm exec wrangler deploy`
4. Vlastná subdoména: v `wrangler.jsonc` pridaj `"routes": [{ "pattern": "recepty.tvojadomena.sk", "custom_domain": true }]`.
