/** How long server-side data is kept; shown on /sukromie, so change both together. */

/** Sync backups no device has opened for this long are deleted. */
export const SYNC_IDLE_DAYS = 730;
/** Handled recipe suggestions and feedback are deleted this long after they arrived. */
export const HANDLED_RETENTION_DAYS = 365;
/** Water reminders of a device that hasn't opened Receptio for this long stop and are deleted. */
export const PUSH_IDLE_DAYS = 60;
/** Searches that found nothing are forgotten this long after anyone last typed them. */
export const SEARCH_MISS_DAYS = 180;
