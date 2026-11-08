/** Inquiries are kept for 24 months (see /privacy), then deleted. */
export const RETENTION = '-24 months';

export async function purgeExpiredInquiries(db: D1Database): Promise<number> {
  const result = await db
    .prepare(`DELETE FROM inquiries WHERE created_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', ?)`)
    .bind(RETENTION)
    .run();
  return result.meta.changes ?? 0;
}
