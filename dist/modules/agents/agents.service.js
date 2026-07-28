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
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
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
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var AgentsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const argon2 = __importStar(require("argon2"));
const marketing_agent_entity_1 = require("./entities/marketing-agent.entity");
const agent_attribution_entity_1 = require("./entities/agent-attribution.entity");
const agent_payout_entity_1 = require("./entities/agent-payout.entity");
const user_entity_1 = require("../users/entities/user.entity");
const order_entity_1 = require("../orders/entities/order.entity");
const paystack_provider_1 = require("../payments/providers/paystack.provider");
const ARGON2_OPTIONS = {
    type: 2,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
};
const GLOBAL_RATE_KEY = 'agent_commission_rate_bps';
const DEFAULT_RATE_BPS = 500;
function calcCommissionMinor(orderTotalMinor, bps) {
    if (orderTotalMinor <= 0 || bps <= 0)
        return 0;
    return Math.floor((orderTotalMinor * bps) / 10_000);
}
function codePrefix(firstName) {
    const letters = (firstName ?? '').toUpperCase().replace(/[^A-Z]/g, '');
    const padded = (letters + 'XXX').slice(0, 3);
    return padded;
}
function randomSuffix() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < 4; i++) {
        out += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return out;
}
let AgentsService = AgentsService_1 = class AgentsService {
    constructor(agentRepo, attributionRepo, payoutRepo, userRepo, orderRepo, paystack, dataSource) {
        this.agentRepo = agentRepo;
        this.attributionRepo = attributionRepo;
        this.payoutRepo = payoutRepo;
        this.userRepo = userRepo;
        this.orderRepo = orderRepo;
        this.paystack = paystack;
        this.dataSource = dataSource;
        this.logger = new common_1.Logger(AgentsService_1.name);
    }
    async getGlobalRateBps() {
        const row = await this.dataSource.query(`SELECT "value" FROM "app_settings" WHERE "key" = $1`, [GLOBAL_RATE_KEY]);
        const raw = row[0]?.value;
        const parsed = typeof raw === 'number' ? raw : Number(raw);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RATE_BPS;
    }
    async setGlobalRateBps(bps, updatedBy) {
        if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) {
            throw new common_1.BadRequestException('Commission rate must be between 0 and 10000 basis points (0–100%).');
        }
        await this.dataSource.query(`INSERT INTO "app_settings" ("key", "value", "updatedAt", "updatedBy")
       VALUES ($1, $2::jsonb, now(), $3)
       ON CONFLICT ("key") DO UPDATE
         SET "value" = EXCLUDED."value",
             "updatedAt" = EXCLUDED."updatedAt",
             "updatedBy" = EXCLUDED."updatedBy"`, [GLOBAL_RATE_KEY, String(bps), updatedBy]);
        return bps;
    }
    async createAgent(input) {
        const email = input.email.toLowerCase().trim();
        if (await this.userRepo.findOne({ where: { email } })) {
            throw new common_1.ConflictException('An account with this email already exists');
        }
        const verify = await this.paystack.resolveBankAccount({
            accountNumber: input.bankAccountNumber.trim(),
            bankCode: input.bankCode.trim(),
        });
        if ('error' in verify) {
            throw new common_1.BadRequestException(`Bank account could not be verified: ${verify.error}`);
        }
        const accountName = verify.accountName.trim();
        if (!this.nameMatchesAccount(input.firstName, input.lastName, accountName)) {
            throw new common_1.BadRequestException(`Name mismatch: the bank account is registered to "${accountName}", ` +
                `which does not share any name with "${input.firstName} ${input.lastName}". ` +
                `At least one of your names must match the bank account name. ` +
                `Use a bank account in your own name, or check the name you entered.`);
        }
        const passwordHash = await argon2.hash(input.password, ARGON2_OPTIONS);
        return this.dataSource.transaction(async (manager) => {
            const user = manager.create(user_entity_1.User, {
                firstName: input.firstName.trim(),
                lastName: input.lastName.trim(),
                email,
                passwordHash,
                phone: input.phone,
                countryCode: 'NG',
                preferredCurrency: 'NGN',
                role: user_entity_1.UserRole.MARKETING_AGENT,
                emailVerified: false,
            });
            await manager.save(user_entity_1.User, user);
            const code = await this.allocateUniqueCode(manager, input.firstName);
            const agent = manager.create(marketing_agent_entity_1.MarketingAgent, {
                userId: user.id,
                code,
                bankCode: input.bankCode.trim(),
                bankAccountNumber: input.bankAccountNumber.trim(),
                bankAccountName: accountName,
                status: marketing_agent_entity_1.AgentStatus.PENDING_APPROVAL,
                walletBalanceMinor: 0,
                lifetimeEarnedMinor: 0,
                lifetimePaidMinor: 0,
            });
            const saved = await manager.save(marketing_agent_entity_1.MarketingAgent, agent);
            this.logger.log(`Agent signup ${saved.code} (user=${user.id}, status=PENDING_APPROVAL)`);
            return saved;
        });
    }
    async authenticateForLogin(email, password) {
        const user = await this.userRepo
            .createQueryBuilder('u')
            .addSelect('u.passwordHash')
            .where('u.email = :email', { email: email.toLowerCase() })
            .andWhere('u.role = :role', { role: user_entity_1.UserRole.MARKETING_AGENT })
            .getOne();
        if (!user) {
            await argon2.hash('dummy', ARGON2_OPTIONS);
            throw new common_1.UnauthorizedException('No agent account exists for this email. Check the email, or apply to become an agent.');
        }
        const ok = await argon2.verify(user.passwordHash, password);
        if (!ok) {
            throw new common_1.UnauthorizedException('Incorrect password for this agent account.');
        }
        const agent = await this.agentRepo.findOne({ where: { userId: user.id } });
        if (!agent) {
            throw new common_1.UnauthorizedException('Agent profile missing — contact support');
        }
        if (agent.status === marketing_agent_entity_1.AgentStatus.PENDING_APPROVAL) {
            throw new common_1.ForbiddenException('Your account is awaiting super-admin approval. You will be notified when it is reviewed.');
        }
        if (agent.status === marketing_agent_entity_1.AgentStatus.REJECTED) {
            throw new common_1.ForbiddenException('Your account application was rejected. Contact support if you think this is in error.');
        }
        if (agent.status === marketing_agent_entity_1.AgentStatus.SUSPENDED) {
            throw new common_1.ForbiddenException('Your account is suspended. Contact support to reinstate it.');
        }
        return { user, agent };
    }
    async list(opts) {
        const page = Math.max(1, opts.page ?? 1);
        const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
        const qb = this.agentRepo
            .createQueryBuilder('a')
            .leftJoinAndSelect('a.user', 'u')
            .orderBy('a.createdAt', 'DESC')
            .skip((page - 1) * limit)
            .take(limit);
        if (opts.status)
            qb.andWhere('a.status = :status', { status: opts.status });
        if (opts.search) {
            const s = `%${opts.search}%`;
            qb.andWhere('(a.code ILIKE :s OR u.email ILIKE :s OR u."firstName" ILIKE :s OR u."lastName" ILIKE :s)', { s });
        }
        const [items, total] = await qb.getManyAndCount();
        return { items, total, page, limit, pages: Math.ceil(total / limit) };
    }
    async findById(id) {
        const a = await this.agentRepo.findOne({
            where: { id },
            relations: { user: true },
        });
        if (!a)
            throw new common_1.NotFoundException(`Agent ${id} not found`);
        return a;
    }
    async findByUserId(userId) {
        const a = await this.agentRepo.findOne({
            where: { userId },
            relations: { user: true },
        });
        if (!a)
            throw new common_1.NotFoundException(`Agent for user ${userId} not found`);
        return a;
    }
    async approve(id, decidedBy) {
        const a = await this.findById(id);
        if (a.status !== marketing_agent_entity_1.AgentStatus.PENDING_APPROVAL) {
            throw new common_1.BadRequestException(`Agent is ${a.status}; only PENDING_APPROVAL can be approved.`);
        }
        a.status = marketing_agent_entity_1.AgentStatus.APPROVED;
        a.decidedBy = decidedBy;
        a.decidedAt = new Date();
        a.decisionReason = null;
        await this.agentRepo.save(a);
        return a;
    }
    async reject(id, decidedBy, reason) {
        const a = await this.findById(id);
        if (a.status !== marketing_agent_entity_1.AgentStatus.PENDING_APPROVAL) {
            throw new common_1.BadRequestException(`Agent is ${a.status}; only PENDING_APPROVAL can be rejected.`);
        }
        a.status = marketing_agent_entity_1.AgentStatus.REJECTED;
        a.decidedBy = decidedBy;
        a.decidedAt = new Date();
        a.decisionReason = reason ?? null;
        await this.agentRepo.save(a);
        return a;
    }
    async suspend(id, decidedBy, reason) {
        const a = await this.findById(id);
        if (a.status !== marketing_agent_entity_1.AgentStatus.APPROVED) {
            throw new common_1.BadRequestException(`Only APPROVED agents can be suspended.`);
        }
        a.status = marketing_agent_entity_1.AgentStatus.SUSPENDED;
        a.decidedBy = decidedBy;
        a.decidedAt = new Date();
        a.decisionReason = reason ?? null;
        await this.agentRepo.save(a);
        return a;
    }
    async setAgentRateBps(id, bpsOrNull) {
        if (bpsOrNull !== null) {
            if (!Number.isInteger(bpsOrNull) ||
                bpsOrNull < 0 ||
                bpsOrNull > 10_000) {
                throw new common_1.BadRequestException('Commission rate must be 0–10000 basis points.');
            }
        }
        const a = await this.findById(id);
        a.commissionRateBps = bpsOrNull;
        await this.agentRepo.save(a);
        return a;
    }
    async validateAgentCode(rawCode) {
        const code = rawCode.trim().toUpperCase();
        if (!code)
            throw new common_1.BadRequestException('Agent code is required.');
        const agent = await this.agentRepo.findOne({
            where: { code },
            relations: { user: true },
        });
        if (!agent)
            throw new common_1.NotFoundException(`No agent with code ${code}.`);
        if (agent.status !== marketing_agent_entity_1.AgentStatus.APPROVED) {
            throw new common_1.BadRequestException(`Agent code ${code} is not active.`);
        }
        return {
            agentId: agent.id,
            code: agent.code,
            agentName: `${agent.user.firstName} ${agent.user.lastName}`.trim(),
        };
    }
    async applyAttributionOnPaid(orderId) {
        try {
            const order = await this.orderRepo.findOne({ where: { id: orderId } });
            if (!order?.agentCode)
                return;
            const existing = await this.attributionRepo.findOne({
                where: { orderId: order.id },
            });
            if (existing) {
                if (existing.status === agent_attribution_entity_1.AgentAttributionStatus.PENDING) {
                    existing.status = agent_attribution_entity_1.AgentAttributionStatus.EARNED;
                    existing.earnedAt = new Date();
                    await this.attributionRepo.save(existing);
                    await this.agentRepo.increment({ id: existing.agentId }, 'walletBalanceMinor', existing.commissionMinor);
                    await this.agentRepo.increment({ id: existing.agentId }, 'lifetimeEarnedMinor', existing.commissionMinor);
                }
                return;
            }
            const code = order.agentCode.trim().toUpperCase();
            const agent = await this.agentRepo.findOne({ where: { code } });
            if (!agent) {
                this.logger.warn(`Order ${order.orderNumber} has agentCode=${code} but no matching agent.`);
                return;
            }
            if (agent.status !== marketing_agent_entity_1.AgentStatus.APPROVED) {
                this.logger.warn(`Order ${order.orderNumber} agent ${code} is ${agent.status}; skipping credit.`);
                return;
            }
            const rateBps = agent.commissionRateBps ?? (await this.getGlobalRateBps());
            const orderTotal = Number(order.grandTotal);
            const commission = calcCommissionMinor(orderTotal, rateBps);
            if (commission <= 0) {
                this.logger.debug(`Order ${order.orderNumber} produced 0 commission; skipping.`);
                return;
            }
            const channel = order.channel?.toString() ?? 'STOREFRONT';
            await this.dataSource.transaction(async (manager) => {
                const attribution = manager.create(agent_attribution_entity_1.AgentAttribution, {
                    agentId: agent.id,
                    agentCode: agent.code,
                    orderId: order.id,
                    orderNumber: order.orderNumber,
                    orderTotalMinor: orderTotal,
                    commissionRateBps: rateBps,
                    commissionMinor: commission,
                    currency: order.currency,
                    status: agent_attribution_entity_1.AgentAttributionStatus.EARNED,
                    channel,
                    earnedAt: new Date(),
                });
                await manager.save(agent_attribution_entity_1.AgentAttribution, attribution);
                await manager.increment(marketing_agent_entity_1.MarketingAgent, { id: agent.id }, 'walletBalanceMinor', commission);
                await manager.increment(marketing_agent_entity_1.MarketingAgent, { id: agent.id }, 'lifetimeEarnedMinor', commission);
            });
            this.logger.log(`Credited agent ${agent.code} commission ${commission} on order ${order.orderNumber} (${rateBps} bps).`);
        }
        catch (err) {
            this.logger.error(`applyAttributionOnPaid failed for order ${orderId}: ${err.message}`);
        }
    }
    async reverseAttributionOnRefund(orderId) {
        try {
            const a = await this.attributionRepo.findOne({ where: { orderId } });
            if (!a)
                return;
            if (a.status !== agent_attribution_entity_1.AgentAttributionStatus.EARNED)
                return;
            await this.dataSource.transaction(async (manager) => {
                await manager.update(agent_attribution_entity_1.AgentAttribution, { id: a.id }, {
                    status: agent_attribution_entity_1.AgentAttributionStatus.REVERSED,
                    reversedAt: new Date(),
                });
                await manager.decrement(marketing_agent_entity_1.MarketingAgent, { id: a.agentId }, 'walletBalanceMinor', a.commissionMinor);
            });
            this.logger.log(`Reversed commission for agent ${a.agentCode} on order ${a.orderNumber}.`);
        }
        catch (err) {
            this.logger.error(`reverseAttributionOnRefund failed for order ${orderId}: ${err.message}`);
        }
    }
    async dashboard(agentId) {
        const agent = await this.findById(agentId);
        const [recentAttributions, recentPayouts, ordersCount] = await Promise.all([
            this.attributionRepo.find({
                where: { agentId },
                order: { createdAt: 'DESC' },
                take: 25,
            }),
            this.payoutRepo.find({
                where: { agentId },
                order: { createdAt: 'DESC' },
                take: 10,
            }),
            this.attributionRepo.count({
                where: { agentId, status: agent_attribution_entity_1.AgentAttributionStatus.EARNED },
            }),
        ]);
        return {
            agent,
            totals: {
                walletBalanceMinor: Number(agent.walletBalanceMinor),
                lifetimeEarnedMinor: Number(agent.lifetimeEarnedMinor),
                lifetimePaidMinor: Number(agent.lifetimePaidMinor),
                ordersCount,
            },
            recentAttributions,
            recentPayouts,
        };
    }
    async listAttributionsForAgent(agentId, page = 1, limit = 20) {
        const p = Math.max(1, page);
        const l = Math.min(100, Math.max(1, limit));
        const [items, total] = await this.attributionRepo.findAndCount({
            where: { agentId },
            order: { createdAt: 'DESC' },
            skip: (p - 1) * l,
            take: l,
        });
        return { items, total, page: p, limit: l, pages: Math.ceil(total / l) };
    }
    async listPayoutsForAgent(agentId, page = 1, limit = 20) {
        const p = Math.max(1, page);
        const l = Math.min(100, Math.max(1, limit));
        const [items, total] = await this.payoutRepo.findAndCount({
            where: { agentId },
            order: { createdAt: 'DESC' },
            skip: (p - 1) * l,
            take: l,
        });
        return { items, total, page: p, limit: l, pages: Math.ceil(total / l) };
    }
    async initiatePayout(agentId, initiatedBy) {
        const agent = await this.findById(agentId);
        if (agent.status !== marketing_agent_entity_1.AgentStatus.APPROVED) {
            throw new common_1.BadRequestException(`Agent is ${agent.status}; only APPROVED agents can be paid out.`);
        }
        return this.dataSource.transaction(async (manager) => {
            await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint);`, [agent.id]);
            const earned = await manager.find(agent_attribution_entity_1.AgentAttribution, {
                where: { agentId: agent.id, status: agent_attribution_entity_1.AgentAttributionStatus.EARNED },
            });
            if (earned.length === 0) {
                throw new common_1.BadRequestException('Agent has no earned commission to pay out.');
            }
            const amount = earned.reduce((s, a) => s + Number(a.commissionMinor), 0);
            if (amount <= 0) {
                throw new common_1.BadRequestException('Computed payout amount is zero.');
            }
            let recipient = agent.transferRecipientCode ?? null;
            if (!recipient) {
                const r = await this.paystack.createTransferRecipient({
                    accountNumber: agent.bankAccountNumber,
                    bankCode: agent.bankCode,
                    accountName: agent.bankAccountName,
                });
                if ('error' in r) {
                    throw new common_1.BadRequestException(`Could not create Paystack recipient: ${r.error}`);
                }
                recipient = r.recipientCode;
                await manager.update(marketing_agent_entity_1.MarketingAgent, { id: agent.id }, { transferRecipientCode: recipient });
            }
            const periodStart = earned.reduce((acc, a) => (!acc || a.createdAt < acc ? a.createdAt : acc), null);
            const periodEnd = earned.reduce((acc, a) => (!acc || a.createdAt > acc ? a.createdAt : acc), null);
            const payout = manager.create(agent_payout_entity_1.AgentPayout, {
                agentId: agent.id,
                amountMinor: amount,
                currency: 'NGN',
                attributionCount: earned.length,
                status: agent_payout_entity_1.AgentPayoutStatus.PROCESSING,
                bankCode: agent.bankCode,
                bankAccountNumber: agent.bankAccountNumber,
                bankAccountName: agent.bankAccountName,
                transferRecipientCode: recipient,
                initiatedBy,
                periodStart,
                periodEnd,
            });
            const saved = await manager.save(agent_payout_entity_1.AgentPayout, payout);
            await manager
                .createQueryBuilder()
                .update(agent_attribution_entity_1.AgentAttribution)
                .set({ status: agent_attribution_entity_1.AgentAttributionStatus.PAID, payoutId: saved.id })
                .where('id IN (:...ids)', { ids: earned.map((e) => e.id) })
                .execute();
            await manager.decrement(marketing_agent_entity_1.MarketingAgent, { id: agent.id }, 'walletBalanceMinor', amount);
            await manager.increment(marketing_agent_entity_1.MarketingAgent, { id: agent.id }, 'lifetimePaidMinor', amount);
            const transfer = await this.paystack.initiateTransfer({
                recipientCode: recipient,
                amount,
                reason: `Agent payout ${agent.code}`,
                reference: `AGT-${saved.id}`,
            });
            if ('error' in transfer) {
                await manager.update(agent_payout_entity_1.AgentPayout, { id: saved.id }, {
                    status: agent_payout_entity_1.AgentPayoutStatus.FAILED,
                    failureReason: transfer.error,
                });
                await manager
                    .createQueryBuilder()
                    .update(agent_attribution_entity_1.AgentAttribution)
                    .set({ status: agent_attribution_entity_1.AgentAttributionStatus.EARNED, payoutId: null })
                    .where('payoutId = :pid', { pid: saved.id })
                    .execute();
                await manager.increment(marketing_agent_entity_1.MarketingAgent, { id: agent.id }, 'walletBalanceMinor', amount);
                await manager.decrement(marketing_agent_entity_1.MarketingAgent, { id: agent.id }, 'lifetimePaidMinor', amount);
                return (await manager.findOne(agent_payout_entity_1.AgentPayout, {
                    where: { id: saved.id },
                }));
            }
            await manager.update(agent_payout_entity_1.AgentPayout, { id: saved.id }, { providerReference: transfer.providerReference });
            if (transfer.status === 'SUCCEEDED') {
                await manager.update(agent_payout_entity_1.AgentPayout, { id: saved.id }, {
                    status: agent_payout_entity_1.AgentPayoutStatus.SUCCEEDED,
                    paidAt: new Date(),
                });
            }
            return (await manager.findOne(agent_payout_entity_1.AgentPayout, {
                where: { id: saved.id },
            }));
        });
    }
    async settlePayout(providerReference, outcome, raw, failureReason) {
        const payout = await this.payoutRepo.findOne({
            where: { providerReference },
        });
        if (!payout)
            return null;
        if (payout.status === agent_payout_entity_1.AgentPayoutStatus.SUCCEEDED)
            return payout;
        return this.dataSource.transaction(async (manager) => {
            if (outcome === 'SUCCEEDED') {
                await manager.update(agent_payout_entity_1.AgentPayout, { id: payout.id }, {
                    status: agent_payout_entity_1.AgentPayoutStatus.SUCCEEDED,
                    paidAt: new Date(),
                    rawProviderData: {
                        ...(payout.rawProviderData ?? {}),
                        settle: raw,
                    },
                });
            }
            else {
                await manager.update(agent_payout_entity_1.AgentPayout, { id: payout.id }, {
                    status: agent_payout_entity_1.AgentPayoutStatus.FAILED,
                    failureReason: failureReason ?? 'Provider reported failure',
                    rawProviderData: {
                        ...(payout.rawProviderData ?? {}),
                        settle: raw,
                    },
                });
                await manager
                    .createQueryBuilder()
                    .update(agent_attribution_entity_1.AgentAttribution)
                    .set({ status: agent_attribution_entity_1.AgentAttributionStatus.EARNED, payoutId: null })
                    .where('payoutId = :pid', { pid: payout.id })
                    .execute();
                await manager.increment(marketing_agent_entity_1.MarketingAgent, { id: payout.agentId }, 'walletBalanceMinor', Number(payout.amountMinor));
                await manager.decrement(marketing_agent_entity_1.MarketingAgent, { id: payout.agentId }, 'lifetimePaidMinor', Number(payout.amountMinor));
            }
            return (await manager.findOne(agent_payout_entity_1.AgentPayout, {
                where: { id: payout.id },
            }));
        });
    }
    async allocateUniqueCode(manager, firstName) {
        const prefix = codePrefix(firstName);
        for (let attempt = 0; attempt < 8; attempt++) {
            const code = `${prefix}-${randomSuffix()}`;
            const taken = await manager.findOne(marketing_agent_entity_1.MarketingAgent, { where: { code } });
            if (!taken)
                return code;
        }
        for (let attempt = 0; attempt < 8; attempt++) {
            const code = `${prefix}-${randomSuffix()}${randomSuffix()}`;
            const taken = await manager.findOne(marketing_agent_entity_1.MarketingAgent, { where: { code } });
            if (!taken)
                return code;
        }
        throw new common_1.ConflictException('Could not allocate a unique agent code — try again');
    }
    nameMatchesAccount(firstName, lastName, accountName) {
        const tokenise = (s) => s
            .toUpperCase()
            .split(/[^A-Z]+/)
            .filter((t) => t.length >= 2);
        const accountTokens = new Set(tokenise(accountName));
        const formTokens = tokenise(`${firstName} ${lastName}`);
        if (formTokens.length === 0 || accountTokens.size === 0)
            return false;
        return formTokens.some((t) => accountTokens.has(t));
    }
};
exports.AgentsService = AgentsService;
exports.AgentsService = AgentsService = AgentsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(marketing_agent_entity_1.MarketingAgent)),
    __param(1, (0, typeorm_1.InjectRepository)(agent_attribution_entity_1.AgentAttribution)),
    __param(2, (0, typeorm_1.InjectRepository)(agent_payout_entity_1.AgentPayout)),
    __param(3, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __param(4, (0, typeorm_1.InjectRepository)(order_entity_1.Order)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        paystack_provider_1.PaystackProvider,
        typeorm_2.DataSource])
], AgentsService);
//# sourceMappingURL=agents.service.js.map