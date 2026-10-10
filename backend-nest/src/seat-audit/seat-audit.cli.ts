import { config } from 'dotenv';
import { createConnection } from 'mongoose';
import { resolve } from 'node:path';
import { readSeatAudit } from './read-seat-audit';

async function main(): Promise<void> {
  const eventIds = [...new Set(process.argv.slice(2))];
  if (!eventIds.length)
    throw new Error('Usage: npm run audit:seats -- <eventId> [eventId...]');
  config({ path: resolve(process.cwd(), '.env') });
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) throw new Error('MONGODB_URI is not configured');
  const connection = await createConnection(uri).asPromise();
  try {
    const reports = [];
    for (const eventId of eventIds)
      reports.push(await readSeatAudit(connection, eventId, 0));
    process.stdout.write(
      `${JSON.stringify(reports.length === 1 ? reports[0] : reports, null, 2)}\n`,
    );
    if (reports.some((report) => report.issues.length > 0))
      process.exitCode = 2;
  } finally {
    await connection.close();
  }
}

void main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
