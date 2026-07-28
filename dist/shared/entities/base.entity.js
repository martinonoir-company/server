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
exports.BaseEntity = void 0;
exports.generateUlid = generateUlid;
const typeorm_1 = require("typeorm");
class BaseEntity {
    generateId() {
        if (!this.id) {
            this.id = generateUlid();
        }
    }
}
exports.BaseEntity = BaseEntity;
__decorate([
    (0, typeorm_1.PrimaryColumn)('varchar', { length: 26 }),
    __metadata("design:type", String)
], BaseEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ type: 'timestamptz' }),
    __metadata("design:type", Date)
], BaseEntity.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ type: 'timestamptz' }),
    __metadata("design:type", Date)
], BaseEntity.prototype, "updatedAt", void 0);
__decorate([
    (0, typeorm_1.DeleteDateColumn)({ type: 'timestamptz', nullable: true }),
    __metadata("design:type", Object)
], BaseEntity.prototype, "deletedAt", void 0);
__decorate([
    (0, typeorm_1.BeforeInsert)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], BaseEntity.prototype, "generateId", null);
function generateUlid() {
    const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    const ENCODING_LEN = ENCODING.length;
    const TIME_LEN = 10;
    const RANDOM_LEN = 16;
    const now = Date.now();
    let str = '';
    let t = now;
    for (let i = TIME_LEN - 1; i >= 0; i--) {
        str = ENCODING[t % ENCODING_LEN] + str;
        t = Math.floor(t / ENCODING_LEN);
    }
    const randomBytes = new Uint8Array(10);
    crypto.getRandomValues(randomBytes);
    for (let i = 0; i < RANDOM_LEN; i++) {
        const byteIndex = Math.floor((i * 5) / 8);
        const bitOffset = (i * 5) % 8;
        let val = (randomBytes[byteIndex] >> (8 - bitOffset - 5)) & 0x1f;
        if (bitOffset > 3 && byteIndex + 1 < randomBytes.length) {
            val |= (randomBytes[byteIndex + 1] >> (16 - bitOffset - 5)) & 0x1f;
        }
        str += ENCODING[val & 0x1f];
    }
    return str;
}
//# sourceMappingURL=base.entity.js.map