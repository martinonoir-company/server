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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PosSyncJob = exports.SyncJobStatus = void 0;
const typeorm_1 = require("typeorm");
const base_entity_1 = require("../../../shared/entities/base.entity");
var SyncJobStatus;
(function (SyncJobStatus) {
    SyncJobStatus["PENDING"] = "PENDING";
    SyncJobStatus["PROCESSING"] = "PROCESSING";
    SyncJobStatus["COMPLETED"] = "COMPLETED";
    SyncJobStatus["FAILED"] = "FAILED";
    SyncJobStatus["DEAD_LETTER"] = "DEAD_LETTER";
})(SyncJobStatus || (exports.SyncJobStatus = SyncJobStatus = {}));
let PosSyncJob = class PosSyncJob extends base_entity_1.BaseEntity {
};
exports.PosSyncJob = PosSyncJob;
__decorate([
    (0, typeorm_1.Index)({ unique: true }),
    (0, typeorm_1.Column)({ type: 'varchar', length: 64 }),
    __metadata("design:type", String)
], PosSyncJob.prototype, "transactionId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 100 }),
    __metadata("design:type", String)
], PosSyncJob.prototype, "terminalId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'jsonb' }),
    __metadata("design:type", Object)
], PosSyncJob.prototype, "transactionPayload", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ type: 'enum', enum: SyncJobStatus, default: SyncJobStatus.PENDING }),
    __metadata("design:type", String)
], PosSyncJob.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', default: 0 }),
    __metadata("design:type", Number)
], PosSyncJob.prototype, "retryCount", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], PosSyncJob.prototype, "errorMessage", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 26, nullable: true }),
    __metadata("design:type", String)
], PosSyncJob.prototype, "orderId", void 0);
exports.PosSyncJob = PosSyncJob = __decorate([
    (0, typeorm_1.Entity)('pos_sync_jobs')
], PosSyncJob);
//# sourceMappingURL=pos-sync-job.entity.js.map