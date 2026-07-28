import { PosSyncService } from './pos-sync.service';
import { Repository } from 'typeorm';
import { PosSyncJob } from './entities/pos-sync-job.entity';
import { ConfigService } from '@nestjs/config';
export declare class PosSyncWorkerService {
    private readonly posSyncService;
    private readonly jobRepo;
    private readonly configService;
    private readonly logger;
    private readonly maxRetries;
    constructor(posSyncService: PosSyncService, jobRepo: Repository<PosSyncJob>, configService: ConfigService);
    retryFailedJobs(): Promise<void>;
}
