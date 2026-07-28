"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const data_source_1 = __importDefault(require("../data-source"));
const user_entity_1 = require("../../modules/users/entities/user.entity");
const argon2 = __importStar(require("argon2"));
async function seedPosUser() {
    await data_source_1.default.initialize();
    console.log('  ✓ Database connected');
    const userRepo = data_source_1.default.getRepository(user_entity_1.User);
    const email = 'pos@martinonoir.com';
    const password = 'PosStaff2026!';
    const existing = await userRepo.findOne({ where: { email } });
    if (existing) {
        console.log(`  ✓ POS user already exists: ${email}`);
        await data_source_1.default.destroy();
        return;
    }
    const passwordHash = await argon2.hash(password, {
        type: argon2.argon2id,
    });
    const user = userRepo.create({
        firstName: 'POS',
        lastName: 'Staff',
        email,
        passwordHash,
        role: user_entity_1.UserRole.COMPANY_STAFF,
        emailVerified: true,
        countryCode: 'NG',
        preferredCurrency: 'NGN',
    });
    await userRepo.save(user);
    console.log(`  + Created POS user:`);
    console.log(`      Email:    ${email}`);
    console.log(`      Password: ${password}`);
    console.log(`      Role:     ${user_entity_1.UserRole.COMPANY_STAFF}`);
    console.log(`      ID:       ${user.id}`);
    await data_source_1.default.destroy();
    console.log('  ✓ Done');
}
seedPosUser().catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
});
//# sourceMappingURL=seed-pos-user.js.map