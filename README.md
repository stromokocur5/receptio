# Receptio

Komunitné vegánske a bezlepkové recepty so živinami, cenami, špajzou, týždenným plánom a nákupným zoznamom.
Zadarmo, bez reklám a bez registrácie. SvelteKit na Cloudflare Workers.

## Spustenie

```sh
pnpm install
pnpm exec wrangler d1 migrations apply receptio --local   # lokálna DB pre lajky
pnpm dev                                                  # http://localhost:5173
```

| Príkaz         | Čo robí                                                             |
| -------------- | ------------------------------------------------------------------- |
| `pnpm test`    | unit testy + validácia celého obsahu (neznáme suroviny, jednotky …) |
| `pnpm check`   | typecheck                                                           |
| `pnpm build`   | produkčný build (všetky stránky sa prerenderujú)                    |
| `pnpm preview` | build v reálnom Workers runtime (`wrangler dev`)                    |

## Ako to funguje

- **Obsah je v gite** (`content/`), nie v databáze. Recepty pridáva len správca, takže netreba login ani admin.
- **Čísla sa počítajú, nepíšu.** Recept odkazuje na suroviny z `content/ingredients.yaml`. Build z nich
  vypočíta živiny na porciu, bezlepkovosť (vrátane „po zámene“ napr. sójovka → tamari), alergény, cenu
  a odkazy na návody zo sekcie Základy.
- **Špajza, plán a nákupný zoznam** sú v `localStorage` prehliadača, žiadne kontá.
- **Lajky** sú jediná serverová vec: D1 tabuľka `likes`, anonymne podľa náhodného ID v httpOnly cookie.
- Všetky stránky sa prerenderujú, Worker obsluhuje iba `/api/likes`.

```
content/
  ingredients.yaml   suroviny: živiny na 100 g, jednotky, lepok, alergény, odhad ceny, návody
  recipes/*.yaml     recepty (id = názov súboru)
  cuisines.yaml      kuchyne sveta + na čo si dať pozor
  prices.yaml        reálne ceny z obchodov (produkt, balenie, cena, dátum, akcia)
  wiki/*.md          základy varenia, suplementy, návody
src/lib/
  amounts.ts nutrition.ts pricing.ts pantry.ts shopping.ts   čistá doménová logika (testovaná)
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

Potom `pnpm test`. Ak surovina neexistuje, jednotka nedáva zmysel alebo chýba hmotnosť pre `ks`, test povie kde.
Nová surovina patrí do `content/ingredients.yaml` (hodnoty na 100 g, ideálne z USDA FoodData Central).

## Ceny

`content/prices.yaml`, každý záznam je konkrétny produkt v konkrétnom obchode a dni. Porovnáva sa cena za kg,
bežná cena po 60 dňoch zastará, akciová platí do `sale_until`. Kým pre surovinu nie je reálna cena, použije sa
odhad z `ingredients.yaml` a appka ho označí.

## Nasadenie (Cloudflare)

1. `pnpm exec wrangler d1 create receptio` a vrátené `database_id` vlož do `wrangler.jsonc`.
2. `pnpm exec wrangler d1 migrations apply receptio --remote`
3. `pnpm build && pnpm exec wrangler deploy`
4. Vlastná subdoména: v `wrangler.jsonc` pridaj `"routes": [{ "pattern": "recepty.tvojadomena.sk", "custom_domain": true }]`.
