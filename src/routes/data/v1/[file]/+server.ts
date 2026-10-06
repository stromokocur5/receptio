import { error } from '@sveltejs/kit';
import { toCsv } from '$lib/price-history';
import { SITE_ORIGIN } from '$lib/site';
import {
	API_BASE,
	API_VERSION,
	LICENSE,
	RESOURCES,
	resourceByName,
	type Field,
	type Resource
} from '$lib/server/open-data';
import { getPriceHistory } from '$lib/server/price-history';
import type { EntryGenerator, RequestHandler } from './$types';

export const prerender = true;

/** The compact day-by-day history the app's charts read; described in openapi.json too. */
const SERIES_FILE = 'historia-serie.json';

export const entries: EntryGenerator = () => [
	...RESOURCES.flatMap((r) => [{ file: `${r.name}.json` }, { file: `${r.name}.csv` }]),
	{ file: SERIES_FILE },
	{ file: 'datapackage.json' },
	{ file: 'openapi.json' }
];

const generated = () => new Date().toISOString();

const json = (body: unknown) =>
	new Response(JSON.stringify(body), {
		headers: { 'content-type': 'application/json; charset=utf-8' }
	});

function resourceJson(r: Resource) {
	const data = r.rows();
	return json({
		resource: r.name,
		title: r.title,
		version: API_VERSION,
		generated: generated(),
		license: LICENSE,
		...(r.sources && { sources: r.sources }),
		count: data.length,
		data
	});
}

function resourceCsv(r: Resource) {
	const names = r.fields.map((f) => f.name);
	const body = toCsv([
		names,
		...r.rows().map((row) => names.map((n) => (row[n] === null ? '' : String(row[n]))))
	]);
	return new Response(body, { headers: { 'content-type': 'text/csv; charset=utf-8' } });
}

/** Frictionless Data Package (https://specs.frictionlessdata.io/data-package/). */
function dataPackage() {
	return json({
		profile: 'tabular-data-package',
		name: 'receptio',
		title: 'Receptio – otvorené dáta',
		description:
			'Vegánske recepty, suroviny s nutričnými hodnotami a ceny potravín v slovenských obchodoch, aj s históriou.',
		homepage: `${SITE_ORIGIN}/data`,
		version: API_VERSION,
		created: generated(),
		licenses: [LICENSE],
		resources: RESOURCES.map((r) => ({
			profile: 'tabular-data-resource',
			name: r.name,
			title: r.title,
			description: r.description,
			path: `${SITE_ORIGIN}${API_BASE}/${r.name}.csv`,
			format: 'csv',
			mediatype: 'text/csv',
			encoding: 'utf-8',
			...(r.sources && { sources: r.sources }),
			schema: {
				fields: r.fields.map((f) => ({
					name: f.name,
					type: f.type,
					description: f.description,
					...(f.enum && { constraints: { enum: f.enum } }),
					...(!f.optional && { constraints: { required: true, ...(f.enum && { enum: f.enum }) } })
				})),
				...(r.primaryKey && { primaryKey: r.primaryKey }),
				...(r.foreignKeys && {
					foreignKeys: r.foreignKeys.map((k) => ({
						fields: k.fields,
						reference: { resource: k.resource, fields: k.field }
					}))
				}),
				missingValues: ['']
			}
		}))
	});
}

const jsonSchemaType = (f: Field) => {
	const type = f.type === 'date' ? 'string' : f.type;
	return {
		type: f.optional ? [type, 'null'] : type,
		description: f.description,
		...(f.type === 'date' && { format: 'date' }),
		...(f.enum && { enum: f.enum })
	};
};

/** OpenAPI 3.1 (https://spec.openapis.org/oas/v3.1.0) of every file above. */
function openApi() {
	const paths: Record<string, unknown> = {};
	const schemas: Record<string, unknown> = {};
	for (const r of RESOURCES) {
		const schemaName = r.name.replace(/(^|-)(\w)/g, (_, __, c: string) => c.toUpperCase());
		schemas[schemaName] = {
			type: 'object',
			required: r.fields.filter((f) => !f.optional).map((f) => f.name),
			properties: Object.fromEntries(r.fields.map((f) => [f.name, jsonSchemaType(f)]))
		};
		paths[`/${r.name}.json`] = {
			get: {
				summary: r.title,
				description: r.description,
				operationId: `get-${r.name}-json`,
				responses: {
					'200': {
						description: r.title,
						content: {
							'application/json': {
								schema: {
									type: 'object',
									required: ['resource', 'version', 'generated', 'count', 'data'],
									properties: {
										resource: { type: 'string', const: r.name },
										title: { type: 'string' },
										version: { type: 'string' },
										generated: { type: 'string', format: 'date-time' },
										license: { $ref: '#/components/schemas/License' },
										sources: { type: 'array', items: { $ref: '#/components/schemas/Source' } },
										count: { type: 'integer' },
										data: { type: 'array', items: { $ref: `#/components/schemas/${schemaName}` } }
									}
								}
							}
						}
					}
				}
			}
		};
		paths[`/${r.name}.csv`] = {
			get: {
				summary: `${r.title} (CSV)`,
				description: `${r.description} RFC 4180, UTF-8, prvý riadok je hlavička; stĺpce ako v ${schemaName}.`,
				operationId: `get-${r.name}-csv`,
				responses: {
					'200': { description: 'CSV', content: { 'text/csv': { schema: { type: 'string' } } } }
				}
			}
		};
	}
	paths[`/${SERIES_FILE}`] = {
		get: {
			summary: 'História cien ako časové rady',
			description:
				'Každý produkt v každom obchode raz, s cenou v prvý deň a v dni, keď sa zmenila. Akcie sú samostatné rady (sale: true). Cena v deň D je posledná zmena ≤ D, ak D ≤ lastSeen (a pri akcii D ≤ koniec akcie).',
			operationId: 'get-price-series',
			responses: {
				'200': {
					description: 'Časové rady',
					content: { 'application/json': { schema: { $ref: '#/components/schemas/PriceHistory' } } }
				}
			}
		}
	};
	paths['/api/statistiky'] = {
		servers: [{ url: SITE_ORIGIN }],
		get: {
			summary: 'Čo varia ostatní',
			description:
				'Živé súhrnné čísla: recepty, ktoré za posledných 7 dní lajklo alebo uvarilo aspoň 2 ľudí, najlepšie hodnotené (aspoň 3 hodnotenia) a celkové počty. Žiadne údaje o jednotlivcoch. Cache 10 minút.',
			operationId: 'get-community-stats',
			responses: {
				'200': {
					description: 'Štatistiky',
					content: {
						'application/json': {
							schema: {
								type: 'object',
								properties: {
									generated: { type: 'string', format: 'date-time' },
									week: {
										type: 'object',
										properties: {
											liked: { type: 'array', items: { $ref: '#/components/schemas/RecipeCount' } },
											cooked: { type: 'array', items: { $ref: '#/components/schemas/RecipeCount' } }
										}
									},
									rated: {
										type: 'array',
										items: {
											type: 'object',
											properties: {
												recipe_id: { type: 'string' },
												rating: { type: 'number' },
												ratings: { type: 'integer' }
											}
										}
									},
									totals: {
										type: 'object',
										properties: {
											likes: { type: 'integer' },
											liking_devices: { type: 'integer' },
											cooked_reports: { type: 'integer' },
											ratings: { type: 'integer' }
										}
									}
								}
							}
						}
					}
				},
				'429': { description: 'Príliš veľa požiadaviek' }
			}
		}
	};
	schemas.RecipeCount = {
		type: 'object',
		properties: { recipe_id: { type: 'string' }, count: { type: 'integer' } }
	};
	paths['/datapackage.json'] = {
		get: {
			summary: 'Popis dát (Frictionless Data Package)',
			operationId: 'get-datapackage',
			responses: { '200': { description: 'Data Package', content: { 'application/json': {} } } }
		}
	};
	schemas.License = {
		type: 'object',
		properties: { name: { type: 'string' }, title: { type: 'string' }, path: { type: 'string' } }
	};
	schemas.Source = {
		type: 'object',
		properties: { title: { type: 'string' }, path: { type: 'string' } }
	};
	schemas.PriceHistory = {
		type: 'object',
		required: ['days', 'series'],
		properties: {
			days: { type: 'array', items: { type: 'string', format: 'date' } },
			series: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						ingredientId: { type: 'string' },
						storeId: { type: 'string' },
						product: { type: 'string' },
						pack: { type: 'string' },
						packGrams: { type: 'number' },
						sale: { type: 'boolean' },
						changes: {
							type: 'array',
							description: '[deň, cena v €, koniec akcie alebo ""]',
							items: {
								type: 'array',
								prefixItems: [{ type: 'string' }, { type: 'number' }, { type: 'string' }]
							}
						},
						lastSeen: { type: 'string', format: 'date' }
					}
				}
			}
		}
	};
	return json({
		openapi: '3.1.0',
		info: {
			title: 'Receptio – otvorené dáta',
			version: API_VERSION,
			description:
				'Len na čítanie, bez kľúča, s CORS pre každý pôvod. Súbory sa obnovujú pri každom nasadení (ceny denne). Zmena, ktorá by rozbila klientov, dostane nové /data/v2.',
			license: { name: LICENSE.title, identifier: LICENSE.name },
			contact: { url: `${SITE_ORIGIN}/navrhni` }
		},
		servers: [{ url: `${SITE_ORIGIN}${API_BASE}` }],
		paths,
		components: { schemas }
	});
}

export const GET: RequestHandler = ({ params }) => {
	const { file } = params;
	if (file === 'datapackage.json') return dataPackage();
	if (file === 'openapi.json') return openApi();
	if (file === SERIES_FILE) return json(getPriceHistory());
	const match = /^([a-z-]+)\.(json|csv)$/.exec(file);
	const resource = match && resourceByName.get(match[1]);
	if (!match || !resource) error(404, 'Taký súbor nie je');
	return match[2] === 'json' ? resourceJson(resource) : resourceCsv(resource);
};
