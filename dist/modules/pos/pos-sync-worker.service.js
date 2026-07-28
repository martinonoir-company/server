"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var PosSyncWorkerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PosSyncWorkerService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const pos_sync_service_1 = require("./pos-sync.service");
const pos_sync_job_entity_1 = require("./entities/pos-sync-job.entity");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const pos_sync_job_entity_2 = require("./entities/pos-sync-job.entity");
const config_1 = require("@nestjs/config");
let PosSyncWorkerService = PosSyncWorkerService_1 = class PosSyncWorkerService {
    constructor(posSyncService, jobRepo, configService) {
        this.posSyncService = posSyncService;
        this.jobRepo = jobRepo;
        this.configService = configService;
        this.logger = new common_1.Logger(PosSyncWorkerService_1.name);
        this.maxRetries = this.configService.get('POS_SYNC_RETRY_MAX', 3);
    }
    async retryFailedJobs() {
        const jobs = await this.posSyncService.getRetryableJobs(this.maxRetries);
        if (jobs.length === 0)
            return;
        this.logger.log(`Found ${jobs.length} failed POS sync job(s) to retry`);
        for (const job of jobs) {
            try {
                await this.jobRepo.update(job.id, { status: pos_sync_job_entity_1.SyncJobStatus.PROCESSING });
                const txPayload = job.transactionPayload;
                const result = await this.posSyncService.processTransaction(txPayload);
                if (result.status === 'SUCCESS') {
                    await this.posSyncService.completeJob(job.id, result.orderId);
                    this.logger.log(`Retry succeeded for tx=${job.transactionId}, order=${result.orderNumber}`);
                }
                else if (result.status === 'SKIPPED') {
                    await this.posSyncService.completeJob(job.id, result.orderId ?? '');
                    this.logger.log(`Retry skipped (already processed) for tx=${job.transactionId}`);
                }
            }
            catch (error) {
                const reason = error instanceof Error ? error.message : 'Unknown error';
                const newRetryCount = job.retryCount + 1;
                const newStatus = newRetryCount >= this.maxRetries
                    ? pos_sync_job_entity_1.SyncJobStatus.DEAD_LETTER
                    : pos_sync_job_entity_1.SyncJobStatus.FAILED;
                await this.jobRepo.update(job.id, {
                    status: newStatus,
                    retryCount: newRetryCount,
                    errorMessage: reason,
                });
                if (newStatus === pos_sync_job_entity_1.SyncJobStatus.DEAD_LETTER) {
                    this.logger.error(`POS sync job tx=${job.transactionId} moved to DEAD_LETTER after ${newRetryCount} retries: ${reason}`);
                }
                else {
                    this.logger.warn(`POS sync retry ${newRetryCount}/${this.maxRetries} failed for tx=${job.transactionId}: ${reason}`);
                }
            }
        }
    }
};
exports.PosSyncWorkerService = PosSyncWorkerService;
__decorate([
    (0, schedule_1.Cron)('*/2 * * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PosSyncWorkerService.prototype, "retryFailedJobs", null);
exports.PosSyncWorkerService = PosSyncWorkerService = PosSyncWorkerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, typeorm_1.InjectRepository)(pos_sync_job_entity_2.PosSyncJob)),
    __metadata("design:paramtypes", [pos_sync_service_1.PosSyncService,
        typeorm_2.Repository,
        config_1.ConfigService])
], PosSyncWorkerService);
//# sourceMappingURL=pos-sync-worker.service.js.map