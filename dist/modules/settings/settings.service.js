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
exports.SettingsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("typeorm");
const app_setting_entity_1 = require("./entities/app-setting.entity");
const wholesale_1 = require("../../shared/constants/wholesale");
let SettingsService = class SettingsService {
    constructor(dataSource) {
        this.dataSource = dataSource;
    }
    async get(key) {
        const rows = await this.dataSource.query(`SELECT "value" FROM "app_settings" WHERE "key" = $1`, [key]);
        return rows[0]?.value ?? null;
    }
    async set(key, value, updatedBy) {
        await this.dataSource.query(`INSERT INTO "app_settings" ("key", "value", "updatedAt", "updatedBy")
       VALUES ($1, $2::jsonb, now(), $3)
       ON CONFLICT ("key") DO UPDATE
         SET "value" = EXCLUDED."value",
             "updatedAt" = EXCLUDED."updatedAt",
             "updatedBy" = EXCLUDED."updatedBy"`, [key, JSON.stringify(value), updatedBy ?? null]);
    }
    async getWholesaleMinQty() {
        const raw = await this.get(app_setting_entity_1.SETTING_KEYS.WHOLESALE_MIN_QTY);
        const n = typeof raw === 'number' ? raw : Number(raw);
        if (!Number.isFinite(n) || n < 1)
            return wholesale_1.DEFAULT_WHOLESALE_MIN_QTY;
        return Math.floor(n);
    }
    async setWholesaleMinQty(qty, updatedBy) {
        const v = Math.max(1, Math.floor(qty));
        await this.set(app_setting_entity_1.SETTING_KEYS.WHOLESALE_MIN_QTY, v, updatedBy);
        return v;
    }
    async getPublicConfig() {
        return { wholesaleMinQty: await this.getWholesaleMinQty() };
    }
};
exports.SettingsService = SettingsService;
exports.SettingsService = SettingsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeorm_1.DataSource])
], SettingsService);
//# sourceMappingURL=settings.service.js.map