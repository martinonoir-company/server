import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as argon2 from 'argon2';
import {
  MarketingAgent,
  AgentStatus,
} from './entities/marketing-agent.entity';
import {
  AgentAttribution,
  AgentAttributionStatus,
} from './entities/agent-attribution.entity';
import {
  AgentPayout,
  AgentPayoutStatus,
} from './entities/agent-payout.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { Order, OrderChannel } from '../orders/entities/order.entity';
import { PaystackProvider } from '../payments/providers/paystack.provider';
import { generateUlid } from '../../shared/entities/base.entity';

/** Same Argon2 settings used elsewhere in auth.service. */
const ARGON2_OPTIONS = {
  type: 2 as const,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

const GLOBAL_RATE_KEY = 'agent_commission_rate_bps';
const DEFAULT_RATE_BPS = 500; // 5%

/**
 * Money/commission helper. Floor to whole minor units so we never credit
 * a fractional kobo, and never round up to overpay the agent.
 */
function calcCommissionMinor(orderTotalMinor: number, bps: number): number {
  if (orderTotalMinor <= 0 || bps <= 0) return 0;
  return Math.floor((orderTotalMinor * bps) / 10_000);
}

/**
 * Generate the human-readable code prefix from the agent's first name.
 * Uppercases A-Z letters only; pads to 3 chars with X if the name is
 * too short. Strictly deterministic per (firstName).
 */
function codePrefix(firstName: string): string {
  const letters = (firstName ?? '').toUpperCase().replace(/[^A-Z]/g, '');
  const padded = (letters + 'XXX').slice(0, 3);
  return padded;
}

/** 4-char A-Z + 0-9 random suffix. ~36⁴ ≈ 1.7M values per prefix. */
function randomSuffix(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // omit O/0/1/I to reduce confusion
  let out = '';
  for (let i = 0; i < 4; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

interface CreateAgentInput {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  password: string;
  bankCode: string;
  bankAccountNumber: string;
}

@Injectable()
export class AgentsService {
  private readonly logger = new Logger(AgentsService.name);

  constructor(
    @InjectRepository(MarketingAgent)
    private readonly agentRepo: Repository<MarketingAgent>,
    @InjectRepository(AgentAttribution)
    private readonly attributionRepo: Repository<AgentAttribution>,
    @InjectRepository(AgentPayout)
    private readonly payoutRepo: Repository<AgentPayout>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    private readonly paystack: PaystackProvider,
    private readonly dataSource: DataSource,
  ) {}

  // ── Global commission rate ──

  async getGlobalRateBps(): Promise<number> {
    const row = await this.dataSource.query(
      `SELECT "value" FROM "app_settings" WHERE "key" = $1`,
      [GLOBAL_RATE_KEY],
    );
    const raw = row[0]?.value;
    const parsed = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RATE_BPS;
  }

  async setGlobalRateBps(bps: number, updatedBy: string): Promise<number> {
    if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) {
      throw new BadRequestException(
        'Commission rate must be between 0 and 10000 basis points (0–100%).',
      );
    }
    await this.dataSource.query(
      `INSERT INTO "app_settings" ("key", "value", "updatedAt", "updatedBy")
       VALUES ($1, $2::jsonb, now(), $3)
       ON CONFLICT ("key") DO UPDATE
         SET "value" = EXCLUDED."value",
             "updatedAt" = EXCLUDED."updatedAt",
             "updatedBy" = EXCLUDED."updatedBy"`,
      [GLOBAL_RATE_KEY, String(bps), updatedBy],
    );
    return bps;
  }

  // ── Signup (storefront /agent/signup) ──

  /**
   * Create an agent account. The user is created with role
   * MARKETING_AGENT and the agent row starts PENDING_APPROVAL. The
   * caller cannot log in until the super admin approves.
   *
   * Bank verification: we always call Paystack `bank/resolve` first; if
   * the name doesn't loosely match the supplied first+last name we
   * reject. This protects against typos and against fraudulent agents
   * using someone else's account.
   */
  async createAgent(input: CreateAgentInput): Promise<MarketingAgent> {
    const email = input.email.toLowerCase().trim();
    if (await this.userRepo.findOne({ where: { email } })) {
      throw new ConflictException('An account with this email already exists');
    }

    // Bank verification — server-side, never trust the client's claim.
    const verify = await this.paystack.resolveBankAccount({
      accountNumber: input.bankAccountNumber.trim(),
      bankCode: input.bankCode.trim(),
    });
    if ('error' in verify) {
      throw new BadRequestException(
        `Bank account could not be verified: ${verify.error}`,
      );
    }
    const accountName = verify.accountName.trim();
    if (!this.nameMatchesAccount(input.firstName, input.lastName, accountName)) {
      throw new BadRequestException(
        `Name mismatch: the bank account is registered to "${accountName}", ` +
          `which does not share any name with "${input.firstName} ${input.lastName}". ` +
          `At least one of your names must match the bank account name. ` +
          `Use a bank account in your own name, or check the name you entered.`,
      );
    }

    const passwordHash = await argon2.hash(input.password, ARGON2_OPTIONS);

    return this.dataSource.transaction(async (manager) => {
      const user = manager.create(User, {
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        email,
        passwordHash,
        phone: input.phone,
        countryCode: 'NG',
        preferredCurrency: 'NGN',
        role: UserRole.MARKETING_AGENT,
        emailVerified: false,
      });
      await manager.save(User, user);

      const code = await this.allocateUniqueCode(manager, input.firstName);

      const agent = manager.create(MarketingAgent, {
        userId: user.id,
        code,
        bankCode: input.bankCode.trim(),
        bankAccountNumber: input.bankAccountNumber.trim(),
        bankAccountName: accountName,
        status: AgentStatus.PENDING_APPROVAL,
        walletBalanceMinor: 0,
        lifetimeEarnedMinor: 0,
        lifetimePaidMinor: 0,
      });
      const saved = await manager.save(MarketingAgent, agent);
      this.logger.log(
        `Agent signup ${saved.code} (user=${user.id}, status=PENDING_APPROVAL)`,
      );
      return saved;
    });
  }

  /**
   * Find a user-by-email, verify password, and check the agent is APPROVED.
   * Used by the storefront agent-login endpoint. Throws with a generic
   * message on bad password (timing-safe enough for our purposes — the
   * customer login already does the same).
   */
  async authenticateForLogin(
    email: string,
    password: string,
  ): Promise<{ user: User; agent: MarketingAgent }> {
    const user = await this.userRepo
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.email = :email', { email: email.toLowerCase() })
      .andWhere('u.role = :role', { role: UserRole.MARKETING_AGENT })
      .getOne();
    if (!user) {
      await argon2.hash('dummy', ARGON2_OPTIONS);
      throw new UnauthorizedException(
        'No agent account exists for this email. Check the email, or apply to become an agent.',
      );
    }
    const ok = await argon2.verify(user.passwordHash, password);
    if (!ok) {
      throw new UnauthorizedException(
        'Incorrect password for this agent account.',
      );
    }
    const agent = await this.agentRepo.findOne({ where: { userId: user.id } });
    if (!agent) {
      throw new UnauthorizedException('Agent profile missing — contact support');
    }
    if (agent.status === AgentStatus.PENDING_APPROVAL) {
      throw new ForbiddenException(
        'Your account is awaiting super-admin approval. You will be notified when it is reviewed.',
      );
    }
    if (agent.status === AgentStatus.REJECTED) {
      throw new ForbiddenException(
        'Your account application was rejected. Contact support if you think this is in error.',
      );
    }
    if (agent.status === AgentStatus.SUSPENDED) {
      throw new ForbiddenException(
        'Your account is suspended. Contact support to reinstate it.',
      );
    }
    return { user, agent };
  }

  // ── Admin: list + decide ──

  async list(opts: {
    page?: number;
    limit?: number;
    status?: AgentStatus;
    search?: string;
  }): Promise<{
    items: MarketingAgent[];
    total: number;
    page: number;
    limit: number;
    pages: number;
  }> {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
    const qb = this.agentRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.user', 'u')
      .orderBy('a.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    if (opts.status) qb.andWhere('a.status = :status', { status: opts.status });
    if (opts.search) {
      const s = `%${opts.search}%`;
      qb.andWhere(
        '(a.code ILIKE :s OR u.email ILIKE :s OR u."firstName" ILIKE :s OR u."lastName" ILIKE :s)',
        { s },
      );
    }
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findById(id: string): Promise<MarketingAgent> {
    const a = await this.agentRepo.findOne({
      where: { id },
      relations: { user: true },
    });
    if (!a) throw new NotFoundException(`Agent ${id} not found`);
    return a;
  }

  async findByUserId(userId: string): Promise<MarketingAgent> {
    const a = await this.agentRepo.findOne({
      where: { userId },
      relations: { user: true },
    });
    if (!a) throw new NotFoundException(`Agent for user ${userId} not found`);
    return a;
  }

  async approve(id: string, decidedBy: string): Promise<MarketingAgent> {
    const a = await this.findById(id);
    if (a.status !== AgentStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        `Agent is ${a.status}; only PENDING_APPROVAL can be approved.`,
      );
    }
    a.status = AgentStatus.APPROVED;
    a.decidedBy = decidedBy;
    a.decidedAt = new Date();
    a.decisionReason = null;
    await this.agentRepo.save(a);
    return a;
  }

  async reject(
    id: string,
    decidedBy: string,
    reason?: string,
  ): Promise<MarketingAgent> {
    const a = await this.findById(id);
    if (a.status !== AgentStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        `Agent is ${a.status}; only PENDING_APPROVAL can be rejected.`,
      );
    }
    a.status = AgentStatus.REJECTED;
    a.decidedBy = decidedBy;
    a.decidedAt = new Date();
    a.decisionReason = reason ?? null;
    await this.agentRepo.save(a);
    return a;
  }

  async suspend(
    id: string,
    decidedBy: string,
    reason?: string,
  ): Promise<MarketingAgent> {
    const a = await this.findById(id);
    if (a.status !== AgentStatus.APPROVED) {
      throw new BadRequestException(
        `Only APPROVED agents can be suspended.`,
      );
    }
    a.status = AgentStatus.SUSPENDED;
    a.decidedBy = decidedBy;
    a.decidedAt = new Date();
    a.decisionReason = reason ?? null;
    await this.agentRepo.save(a);
    return a;
  }

  async setAgentRateBps(
    id: string,
    bpsOrNull: number | null,
  ): Promise<MarketingAgent> {
    if (bpsOrNull !== null) {
      if (
        !Number.isInteger(bpsOrNull) ||
        bpsOrNull < 0 ||
        bpsOrNull > 10_000
      ) {
        throw new BadRequestException(
          'Commission rate must be 0–10000 basis points.',
        );
      }
    }
    const a = await this.findById(id);
    a.commissionRateBps = bpsOrNull;
    await this.agentRepo.save(a);
    return a;
  }

  // ── Attribution: capture, earn, reverse ──

  /**
   * Validate an agent code without crediting anything. Used by the POS /
   * checkout to give the user immediate feedback. Returns the agent
   * snapshot if valid + APPROVED; throws otherwise. The actual credit
   * happens at applyAttributionOnPaid().
   */
  async validateAgentCode(rawCode: string): Promise<{
    agentId: string;
    code: string;
    agentName: string;
  }> {
    const code = rawCode.trim().toUpperCase();
    if (!code) throw new BadRequestException('Agent code is required.');
    const agent = await this.agentRepo.findOne({
      where: { code },
      relations: { user: true },
    });
    if (!agent) throw new NotFoundException(`No agent with code ${code}.`);
    if (agent.status !== AgentStatus.APPROVED) {
      throw new BadRequestException(
        `Agent code ${code} is not active.`,
      );
    }
    return {
      agentId: agent.id,
      code: agent.code,
      agentName: `${agent.user.firstName} ${agent.user.lastName}`.trim(),
    };
  }

  /**
   * Called by the Orders module the moment an order flips to PAID.
   *
   *  - If order.agentCode is empty → no-op.
   *  - If an attribution already exists for this order → no-op (idempotent
   *    on retry; the unique index on orderId is the hard guarantee).
   *  - Otherwise: snapshot the rate (per-agent override → global), compute
   *    commission, write the attribution row as EARNED, credit the
   *    agent's wallet — all inside a single transaction.
   *
   * Never throws into the caller. Failure is logged so a misconfigured
   * agent code does NOT block the order from completing.
   */
  async applyAttributionOnPaid(orderId: string): Promise<void> {
    try {
      const order = await this.orderRepo.findOne({ where: { id: orderId } });
      if (!order?.agentCode) return;

      const existing = await this.attributionRepo.findOne({
        where: { orderId: order.id },
      });
      if (existing) {
        // If we previously created PENDING (future flow), flip to EARNED
        // here. Today we only ever create on PAID, so existing means it's
        // already done.
        if (existing.status === AgentAttributionStatus.PENDING) {
          existing.status = AgentAttributionStatus.EARNED;
          existing.earnedAt = new Date();
          await this.attributionRepo.save(existing);
          await this.agentRepo.increment(
            { id: existing.agentId },
            'walletBalanceMinor',
            existing.commissionMinor,
          );
          await this.agentRepo.increment(
            { id: existing.agentId },
            'lifetimeEarnedMinor',
            existing.commissionMinor,
          );
        }
        return;
      }

      const code = order.agentCode.trim().toUpperCase();
      const agent = await this.agentRepo.findOne({ where: { code } });
      if (!agent) {
        this.logger.warn(
          `Order ${order.orderNumber} has agentCode=${code} but no matching agent.`,
        );
        return;
      }
      if (agent.status !== AgentStatus.APPROVED) {
        this.logger.warn(
          `Order ${order.orderNumber} agent ${code} is ${agent.status}; skipping credit.`,
        );
        return;
      }

      const rateBps =
        agent.commissionRateBps ?? (await this.getGlobalRateBps());
      const orderTotal = Number(order.grandTotal);
      const commission = calcCommissionMinor(orderTotal, rateBps);
      if (commission <= 0) {
        this.logger.debug(
          `Order ${order.orderNumber} produced 0 commission; skipping.`,
        );
        return;
      }

      const channel = order.channel?.toString() ?? 'STOREFRONT';
      await this.dataSource.transaction(async (manager) => {
        const attribution = manager.create(AgentAttribution, {
          agentId: agent.id,
          agentCode: agent.code,
          orderId: order.id,
          orderNumber: order.orderNumber,
          orderTotalMinor: orderTotal,
          commissionRateBps: rateBps,
          commissionMinor: commission,
          currency: order.currency,
          status: AgentAttributionStatus.EARNED,
          channel,
          earnedAt: new Date(),
        });
        await manager.save(AgentAttribution, attribution);

        await manager.increment(
          MarketingAgent,
          { id: agent.id },
          'walletBalanceMinor',
          commission,
        );
        await manager.increment(
          MarketingAgent,
          { id: agent.id },
          'lifetimeEarnedMinor',
          commission,
        );
      });

      this.logger.log(
        `Credited agent ${agent.code} commission ${commission} on order ${order.orderNumber} (${rateBps} bps).`,
      );
    } catch (err) {
      this.logger.error(
        `applyAttributionOnPaid failed for order ${orderId}: ${
          (err as Error).message
        }`,
      );
    }
  }

  /**
   * Called by RefundsService when an order is refunded. Reverses any
   * EARNED attribution: the wallet is debited (can go negative), the
   * attribution flips to REVERSED. PAID attributions are NOT reversed —
   * the money already left the building. Idempotent.
   */
  async reverseAttributionOnRefund(orderId: string): Promise<void> {
    try {
      const a = await this.attributionRepo.findOne({ where: { orderId } });
      if (!a) return;
      if (a.status !== AgentAttributionStatus.EARNED) return;
      await this.dataSource.transaction(async (manager) => {
        await manager.update(
          AgentAttribution,
          { id: a.id },
          {
            status: AgentAttributionStatus.REVERSED,
            reversedAt: new Date(),
          },
        );
        await manager.decrement(
          MarketingAgent,
          { id: a.agentId },
          'walletBalanceMinor',
          a.commissionMinor,
        );
      });
      this.logger.log(
        `Reversed commission for agent ${a.agentCode} on order ${a.orderNumber}.`,
      );
    } catch (err) {
      this.logger.error(
        `reverseAttributionOnRefund failed for order ${orderId}: ${
          (err as Error).message
        }`,
      );
    }
  }

  // ── Dashboard reads ──

  async dashboard(agentId: string): Promise<{
    agent: MarketingAgent;
    totals: {
      walletBalanceMinor: number;
      lifetimeEarnedMinor: number;
      lifetimePaidMinor: number;
      ordersCount: number;
    };
    recentAttributions: AgentAttribution[];
    recentPayouts: AgentPayout[];
  }> {
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
        where: { agentId, status: AgentAttributionStatus.EARNED },
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

  async listAttributionsForAgent(
    agentId: string,
    page = 1,
    limit = 20,
  ): Promise<{
    items: AgentAttribution[];
    total: number;
    page: number;
    limit: number;
    pages: number;
  }> {
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

  async listPayoutsForAgent(
    agentId: string,
    page = 1,
    limit = 20,
  ): Promise<{
    items: AgentPayout[];
    total: number;
    page: number;
    limit: number;
    pages: number;
  }> {
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

  // ── Payouts (super-admin) ──

  /**
   * Initiate a payout for the agent's current EARNED-but-unpaid pool.
   * Computes the amount from the EARNED rows (NOT the denormalised
   * wallet, to defend against drift), creates the payout row, flips the
   * attributions to PAID, debits the wallet, and pushes a Paystack
   * transfer. The webhook will flip the payout to SUCCEEDED.
   *
   * Concurrency: protected by an advisory lock on the agentId so two
   * super-admin clicks can't double-disburse.
   */
  async initiatePayout(
    agentId: string,
    initiatedBy: string,
  ): Promise<AgentPayout> {
    const agent = await this.findById(agentId);
    if (agent.status !== AgentStatus.APPROVED) {
      throw new BadRequestException(
        `Agent is ${agent.status}; only APPROVED agents can be paid out.`,
      );
    }

    return this.dataSource.transaction(async (manager) => {
      // Advisory lock keyed on the agent's id hash — pg accepts a bigint.
      await manager.query(
        `SELECT pg_advisory_xact_lock(hashtext($1)::bigint);`,
        [agent.id],
      );

      const earned = await manager.find(AgentAttribution, {
        where: { agentId: agent.id, status: AgentAttributionStatus.EARNED },
      });
      if (earned.length === 0) {
        throw new BadRequestException('Agent has no earned commission to pay out.');
      }
      const amount = earned.reduce(
        (s, a) => s + Number(a.commissionMinor),
        0,
      );
      if (amount <= 0) {
        throw new BadRequestException('Computed payout amount is zero.');
      }

      // Reuse cached recipient code, or create one now.
      let recipient = agent.transferRecipientCode ?? null;
      if (!recipient) {
        const r = await this.paystack.createTransferRecipient({
          accountNumber: agent.bankAccountNumber,
          bankCode: agent.bankCode,
          accountName: agent.bankAccountName,
        });
        if ('error' in r) {
          throw new BadRequestException(
            `Could not create Paystack recipient: ${r.error}`,
          );
        }
        recipient = r.recipientCode;
        await manager.update(
          MarketingAgent,
          { id: agent.id },
          { transferRecipientCode: recipient },
        );
      }

      const periodStart = earned.reduce<Date | null>(
        (acc, a) => (!acc || a.createdAt < acc ? a.createdAt : acc),
        null,
      );
      const periodEnd = earned.reduce<Date | null>(
        (acc, a) => (!acc || a.createdAt > acc ? a.createdAt : acc),
        null,
      );

      const payout = manager.create(AgentPayout, {
        agentId: agent.id,
        amountMinor: amount,
        currency: 'NGN',
        attributionCount: earned.length,
        status: AgentPayoutStatus.PROCESSING,
        bankCode: agent.bankCode,
        bankAccountNumber: agent.bankAccountNumber,
        bankAccountName: agent.bankAccountName,
        transferRecipientCode: recipient,
        initiatedBy,
        periodStart,
        periodEnd,
      });
      const saved = await manager.save(AgentPayout, payout);

      // Mark the attributions PAID + link to the payout.
      await manager
        .createQueryBuilder()
        .update(AgentAttribution)
        .set({ status: AgentAttributionStatus.PAID, payoutId: saved.id })
        .where('id IN (:...ids)', { ids: earned.map((e) => e.id) })
        .execute();

      // Wallet/credit bookkeeping. lifetimePaid bumps now; we'll bump it
      // again? — no: we ONLY bump it now to keep dashboards consistent.
      await manager.decrement(
        MarketingAgent,
        { id: agent.id },
        'walletBalanceMinor',
        amount,
      );
      await manager.increment(
        MarketingAgent,
        { id: agent.id },
        'lifetimePaidMinor',
        amount,
      );

      // Push the transfer. If Paystack rejects synchronously we flip to
      // FAILED inside this same transaction; otherwise the webhook (or
      // the super-admin retry) will settle it.
      const transfer = await this.paystack.initiateTransfer({
        recipientCode: recipient,
        amount,
        reason: `Agent payout ${agent.code}`,
        reference: `AGT-${saved.id}`,
      });
      if ('error' in transfer) {
        // Roll the attributions back inside the same transaction so a
        // failed push doesn't leave money debited from the wallet.
        await manager.update(
          AgentPayout,
          { id: saved.id },
          {
            status: AgentPayoutStatus.FAILED,
            failureReason: transfer.error,
          },
        );
        await manager
          .createQueryBuilder()
          .update(AgentAttribution)
          .set({ status: AgentAttributionStatus.EARNED, payoutId: null })
          .where('payoutId = :pid', { pid: saved.id })
          .execute();
        await manager.increment(
          MarketingAgent,
          { id: agent.id },
          'walletBalanceMinor',
          amount,
        );
        await manager.decrement(
          MarketingAgent,
          { id: agent.id },
          'lifetimePaidMinor',
          amount,
        );
        return (await manager.findOne(AgentPayout, {
          where: { id: saved.id },
        }))!;
      }

      await manager.update(
        AgentPayout,
        { id: saved.id },
        { providerReference: transfer.providerReference },
      );
      if (transfer.status === 'SUCCEEDED') {
        await manager.update(
          AgentPayout,
          { id: saved.id },
          {
            status: AgentPayoutStatus.SUCCEEDED,
            paidAt: new Date(),
          },
        );
      }
      return (await manager.findOne(AgentPayout, {
        where: { id: saved.id },
      }))!;
    });
  }

  /**
   * Called by the Paystack webhook (transfer.success / transfer.failed)
   * to settle a payout authoritatively. Idempotent on terminal states.
   */
  async settlePayout(
    providerReference: string,
    outcome: 'SUCCEEDED' | 'FAILED',
    raw: Record<string, unknown>,
    failureReason?: string,
  ): Promise<AgentPayout | null> {
    const payout = await this.payoutRepo.findOne({
      where: { providerReference },
    });
    if (!payout) return null;
    if (payout.status === AgentPayoutStatus.SUCCEEDED) return payout;
    return this.dataSource.transaction(async (manager) => {
      if (outcome === 'SUCCEEDED') {
        await manager.update(
          AgentPayout,
          { id: payout.id },
          {
            status: AgentPayoutStatus.SUCCEEDED,
            paidAt: new Date(),
            rawProviderData: {
              ...(payout.rawProviderData ?? {}),
              settle: raw,
            },
          },
        );
      } else {
        // Failure: re-credit the wallet, return attributions to EARNED.
        await manager.update(
          AgentPayout,
          { id: payout.id },
          {
            status: AgentPayoutStatus.FAILED,
            failureReason: failureReason ?? 'Provider reported failure',
            rawProviderData: {
              ...(payout.rawProviderData ?? {}),
              settle: raw,
            },
          },
        );
        await manager
          .createQueryBuilder()
          .update(AgentAttribution)
          .set({ status: AgentAttributionStatus.EARNED, payoutId: null })
          .where('payoutId = :pid', { pid: payout.id })
          .execute();
        await manager.increment(
          MarketingAgent,
          { id: payout.agentId },
          'walletBalanceMinor',
          Number(payout.amountMinor),
        );
        await manager.decrement(
          MarketingAgent,
          { id: payout.agentId },
          'lifetimePaidMinor',
          Number(payout.amountMinor),
        );
      }
      return (await manager.findOne(AgentPayout, {
        where: { id: payout.id },
      }))!;
    });
  }

  // ── Helpers ──

  private async allocateUniqueCode(
    manager: import('typeorm').EntityManager,
    firstName: string,
  ): Promise<string> {
    const prefix = codePrefix(firstName);
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = `${prefix}-${randomSuffix()}`;
      const taken = await manager.findOne(MarketingAgent, { where: { code } });
      if (!taken) return code;
    }
    // Vanishingly unlikely with ~36⁴ space per prefix; fall through to a
    // long random suffix.
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = `${prefix}-${randomSuffix()}${randomSuffix()}`;
      const taken = await manager.findOne(MarketingAgent, { where: { code } });
      if (!taken) return code;
    }
    throw new ConflictException(
      'Could not allocate a unique agent code — try again',
    );
  }

  /**
   * Loose name-match: tokenise both the form name and the bank-resolved
   * account name, and require that AT LEAST ONE token is shared. Names
   * commonly vary between the form and the bank record — a registrant
   * who types "Mark Jones" may have "MARK HERIOS JONES" on the account.
   * As long as one name part overlaps, we accept it. Order is ignored
   * (banks return LAST-FIRST-MIDDLE or FIRST-MIDDLE-LAST). Tokens are
   * case-insensitive and at least 2 chars (drops initials / noise).
   */
  private nameMatchesAccount(
    firstName: string,
    lastName: string,
    accountName: string,
  ): boolean {
    const tokenise = (s: string) =>
      s
        .toUpperCase()
        .split(/[^A-Z]+/)
        .filter((t) => t.length >= 2);
    const accountTokens = new Set(tokenise(accountName));
    const formTokens = tokenise(`${firstName} ${lastName}`);
    if (formTokens.length === 0 || accountTokens.size === 0) return false;
    // Accept when any form token appears in the account name.
    return formTokens.some((t) => accountTokens.has(t));
  }
}
