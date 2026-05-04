import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PosSyncService } from './pos-sync.service';
import { SyncJobStatus } from './entities/pos-sync-job.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PosSyncJob } from './entities/pos-sync-job.entity';
import { ConfigService } from '@nestjs/config';

/**
 * Background worker that retries failed POS sync jobs.
 *
 * Runs every 2 minutes by default.
 * - Picks up FAILED jobs with retryCount < max
 * - Reprocesses via PosSyncService.processTransaction()
 * - Marks as COMPLETED on success, increments retryCount on failure
 * - Marks as DEAD_LETTER after max retries
 */
@Injectable()
export class PosSyncWorkerService {
  private readonly logger = new Logger(PosSyncWorkerService.name);
  private readonly maxRetries: number;

  constructor(
    private readonly posSyncService: PosSyncService,
    @InjectRepository(PosSyncJob) private readonly jobRepo: Repository<PosSyncJob>,
    private readonly configService: ConfigService,
  ) {
    this.maxRetries = this.configService.get<number>('POS_SYNC_RETRY_MAX', 3);
  }

  /**
   * Retry failed POS sync jobs every 2 minutes.
   */
  @Cron('*/2 * * * *')
  async retryFailedJobs(): Promise<void> {
    const jobs = await this.posSyncService.getRetryableJobs(this.maxRetries);

    if (jobs.length === 0) return;

    this.logger.log(`Found ${jobs.length} failed POS sync job(s) to retry`);

    for (const job of jobs) {
      try {
        // Mark as processing
        await this.jobRepo.update(job.id, { status: SyncJobStatus.PROCESSING });

        const txPayload = job.transactionPayload as any;
        const result = await this.posSyncService.processTransaction(txPayload);

        if (result.status === 'SUCCESS') {
          await this.posSyncService.completeJob(job.id, result.orderId!);
          this.logger.log(
            `Retry succeeded for tx=${job.transactionId}, order=${result.orderNumber}`,
          );
        } else if (result.status === 'SKIPPED') {
          // Already processed (another retry succeeded) — mark complete
          await this.posSyncService.completeJob(job.id, result.orderId ?? '');
          this.logger.log(`Retry skipped (already processed) for tx=${job.transactionId}`);
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Unknown error';
        const newRetryCount = job.retryCount + 1;
        const newStatus = newRetryCount >= this.maxRetries
          ? SyncJobStatus.DEAD_LETTER
          : SyncJobStatus.FAILED;

        await this.jobRepo.update(job.id, {
          status: newStatus,
          retryCount: newRetryCount,
          errorMessage: reason,
        });

        if (newStatus === SyncJobStatus.DEAD_LETTER) {
          this.logger.error(
            `POS sync job tx=${job.transactionId} moved to DEAD_LETTER after ${newRetryCount} retries: ${reason}`,
          );
        } else {
          this.logger.warn(
            `POS sync retry ${newRetryCount}/${this.maxRetries} failed for tx=${job.transactionId}: ${reason}`,
          );
        }
      }
    }
  }
}
