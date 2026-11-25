import { DurableObject } from 'cloudflare:workers';

/**
 * Households were left out of v2. The class stays only because the deployed Worker's binding and
 * migration still name it; drop it with a `deleted_classes` migration once v2 is live.
 */
export class HouseholdRoom extends DurableObject {
	fetch(): Response {
		return new Response('Gone', { status: 410 });
	}
}
