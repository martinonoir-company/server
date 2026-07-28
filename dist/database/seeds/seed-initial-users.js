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
const ARGON2_OPTIONS = {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
};
const SPECS = [
    {
        envPrefix: 'SEED_ADMIN',
        role: user_entity_1.UserRole.SUPER_ADMIN,
        defaultFirstName: 'Super',
        defaultLastName: 'Admin',
        countryCode: 'NG',
        preferredCurrency: 'NGN',
    },
    {
        envPrefix: 'SEED_CUSTOMER',
        role: user_entity_1.UserRole.CUSTOMER,
        defaultFirstName: 'Customer',
        defaultLastName: 'User',
        countryCode: 'NG',
        preferredCurrency: 'NGN',
    },
];
function requireEnv(name) {
    const v = process.env[name];
    if (!v || !v.trim()) {
        throw new Error(`Missing required env var: ${name}`);
    }
    return v.trim();
}
function readEnv(name, fallback) {
    const v = process.env[name];
    return v && v.trim() ? v.trim() : fallback;
}
async function seedOne(spec) {
    const email = requireEnv(`${spec.envPrefix}_EMAIL`).toLowerCase();
    const password = requireEnv(`${spec.envPrefix}_PASSWORD`);
    const firstName = readEnv(`${spec.envPrefix}_FIRSTNAME`, spec.defaultFirstName);
    const lastName = readEnv(`${spec.envPrefix}_LASTNAME`, spec.defaultLastName);
    const repo = data_source_1.default.getRepository(user_entity_1.User);
    const existing = await repo
        .createQueryBuilder('u')
        .where('lower(u.email) = :email', { email })
        .getOne();
    if (existing) {
        delete process.env[`${spec.envPrefix}_PASSWORD`];
        return { email, status: 'SKIPPED_EXISTS', role: existing.role, id: existing.id };
    }
    const passwordHash = await argon2.hash(password, ARGON2_OPTIONS);
    delete process.env[`${spec.envPrefix}_PASSWORD`];
    const user = repo.create({
        firstName,
        lastName,
        email,
        passwordHash,
        role: spec.role,
        countryCode: spec.countryCode,
        preferredCurrency: spec.preferredCurrency,
        emailVerified: true,
        failedLoginAttempts: 0,
    });
    const saved = await repo.save(user);
    return { email, status: 'CREATED', role: spec.role, id: saved.id };
}
async function main() {
    if (!data_source_1.default.isInitialized) {
        await data_source_1.default.initialize();
    }
    console.log('── Initial user seed ──');
    console.log(`Connected: db=${data_source_1.default.options.database ?? '?'} host=${data_source_1.default.options.host ?? '?'}`);
    const results = [];
    for (const spec of SPECS) {
        try {
            const r = await seedOne(spec);
            results.push(r);
            console.log(` ${r.status === 'CREATED' ? '+' : '·'} ${r.role.padEnd(20)} ${r.email}${r.status === 'SKIPPED_EXISTS' ? '  (already exists — left untouched)' : ''}`);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(` × ${spec.envPrefix}: ${msg}`);
            throw err;
        }
    }
    await data_source_1.default.destroy();
    console.log('── Done ──');
    console.log('Reminder: rotate the seeded passwords via the apps as soon as you can sign in.');
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=seed-initial-users.js.map