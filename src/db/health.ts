import { sql } from 'drizzle-orm';
import { createHttpDb } from './client';

export async function checkDatabase(databaseUrl: string | undefined): Promise<boolean> {
  if (!databaseUrl) return false;
  try {
    const db = createHttpDb(databaseUrl);
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}
