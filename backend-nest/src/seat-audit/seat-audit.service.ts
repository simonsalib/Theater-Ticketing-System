import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import { randomUUID } from 'node:crypto';
import { Connection } from 'mongoose';
import { MailService } from '../mail/mail.service';
import { readSeatAudit } from './read-seat-audit';
import { issueKey, SeatAuditReport } from './seat-audit';

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const LEASE_MS = 15 * 60 * 1000;
const VERIFY_DELAY_MS = 2_000;

interface SeatAuditJob {
  _id: string;
  owner?: string;
  leaseUntil?: Date;
  startedAt?: Date;
  createdAt?: Date;
  lastRunAt?: Date;
  lastStatus?: string;
  lastEventCount?: number;
  lastIssueCount?: number;
  lastAlertSignature?: string;
  lastAlertAt?: Date;
  lastErrorAt?: Date;
}

@Injectable()
export class SeatAuditService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SeatAuditService.name);
  private readonly workerId = randomUUID();
  private timer?: NodeJS.Timeout;
  private startupTimer?: NodeJS.Timeout;

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  onModuleInit(): void {
    if (!this.isEnabled()) {
      this.logger.log('Scheduled seat audit is disabled');
      return;
    }
    this.startupTimer = setTimeout(() => void this.runScheduledAudit(), 15_000);
    this.startupTimer.unref();
    this.timer = setInterval(() => void this.runScheduledAudit(), TWO_HOURS_MS);
    this.timer.unref();
    this.logger.log('Seat integrity audit scheduled every 2 hours');
  }

  onModuleDestroy(): void {
    if (this.startupTimer) clearTimeout(this.startupTimer);
    if (this.timer) clearInterval(this.timer);
  }

  private isEnabled(): boolean {
    if (this.config.get<string>('NODE_ENV') === 'test') return false;
    return (
      this.config.get<string>('SEAT_AUDIT_ENABLED')?.toLowerCase() !== 'false'
    );
  }

  private async acquireLease(): Promise<boolean> {
    const now = new Date();
    try {
      const result = await this.connection
        .db!.collection<SeatAuditJob>('_system_jobs')
        .findOneAndUpdate(
          {
            _id: 'seat-integrity-audit',
            $or: [
              { leaseUntil: { $lte: now } },
              { leaseUntil: { $exists: false } },
            ],
          },
          {
            $set: {
              owner: this.workerId,
              leaseUntil: new Date(now.getTime() + LEASE_MS),
              startedAt: now,
            },
            $setOnInsert: { createdAt: now },
          },
          { upsert: true, returnDocument: 'after' },
        );
      return result?.owner === this.workerId;
    } catch (error: unknown) {
      // Duplicate _id means another Azure instance currently owns the lease.
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 11000
      ) {
        return false;
      }
      throw error;
    }
  }

  private async releaseLease(
    summary: Partial<Omit<SeatAuditJob, '_id'>>,
  ): Promise<void> {
    await this.connection
      .db!.collection<SeatAuditJob>('_system_jobs')
      .updateOne(
        { _id: 'seat-integrity-audit', owner: this.workerId },
        {
          $set: { ...summary, lastRunAt: new Date() },
          $unset: { owner: '', leaseUntil: '', startedAt: '' },
        },
      );
  }

  async runScheduledAudit(): Promise<void> {
    let ownsLease = false;
    try {
      ownsLease = await this.acquireLease();
      if (!ownsLease) return;

      const events = await this.connection
        .db!.collection('events')
        .find(
          {
            hasTheaterSeating: true,
            status: 'approved',
            date: { $gte: new Date(Date.now() - 86_400_000) },
          },
          {
            projection: { _id: 1, title: 1 },
            sort: { date: 1 },
            maxTimeMS: 30_000,
          },
        )
        .toArray();
      const failures: Array<{ title: string; report: SeatAuditReport }> = [];

      for (const event of events) {
        const first = await readSeatAudit(this.connection, String(event._id));
        if (first.issues.length === 0) continue;

        await new Promise((resolve) => setTimeout(resolve, VERIFY_DELAY_MS));
        const second = await readSeatAudit(this.connection, String(event._id));
        const firstKeys = new Set(first.issues.map(issueKey));
        second.issues = second.issues.filter((issue) =>
          firstKeys.has(issueKey(issue)),
        );
        if (second.issues.length > 0)
          failures.push({
            title: String(event.title || event._id),
            report: second,
          });
      }

      const signature = failures
        .flatMap((f) =>
          f.report.issues.map((i) => `${f.report.eventId}/${issueKey(i)}`),
        )
        .sort()
        .join('|');
      const job = await this.connection
        .db!.collection<SeatAuditJob>('_system_jobs')
        .findOne(
          { _id: 'seat-integrity-audit' },
          { projection: { lastAlertSignature: 1, lastAlertAt: 1 } },
        );
      const lastAlertAge = job?.lastAlertAt
        ? Date.now() - new Date(job.lastAlertAt).getTime()
        : Number.POSITIVE_INFINITY;
      const shouldAlert =
        failures.length > 0 &&
        (job?.lastAlertSignature !== signature ||
          lastAlertAge >= 24 * 60 * 60 * 1000);

      if (shouldAlert) {
        const recipient =
          this.config.get<string>('SEAT_AUDIT_ALERT_EMAIL')?.trim() ||
          'bebonageh68@gmail.com';
        await this.mail.sendSeatIntegrityAlert(recipient, failures);
      }
      await this.releaseLease({
        lastStatus: failures.length ? 'issues' : 'healthy',
        lastEventCount: events.length,
        lastIssueCount: failures.reduce(
          (n, f) => n + f.report.issues.length,
          0,
        ),
        lastAlertSignature: signature,
        ...(shouldAlert ? { lastAlertAt: new Date() } : {}),
      });
      ownsLease = false;
      this.logger.log(
        `Seat audit checked ${events.length} events; ${failures.length} need attention`,
      );
    } catch (error) {
      this.logger.error(
        'Scheduled seat audit failed',
        error instanceof Error ? error.stack : String(error),
      );
      if (ownsLease) {
        await this.releaseLease({
          lastStatus: 'failed',
          lastErrorAt: new Date(),
        }).catch(() => undefined);
      }
    }
  }
}
