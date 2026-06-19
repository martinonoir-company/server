import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { Public } from '../../shared/decorators/public.decorator';
import { RequirePermissions } from '../../shared/decorators/require-permissions.decorator';
import { Permission } from '../users/entities/role.entity';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { AgentsService } from './agents.service';
import { AgentStatus } from './entities/marketing-agent.entity';
import { AuthService } from '../auth/auth.service';
import { PaystackProvider } from '../payments/providers/paystack.provider';

// ── DTOs ──

class AgentSignupDto {
  @IsString() @Length(2, 100) firstName!: string;
  @IsString() @Length(2, 100) lastName!: string;
  @IsEmail() email!: string;
  @IsOptional() @IsString() phone?: string;
  @IsString() @Length(8, 200) password!: string;
  @IsString() @Matches(/^\d{2,10}$/) bankCode!: string;
  @IsString() @Matches(/^\d{10}$/) bankAccountNumber!: string;
}

class AgentLoginDto {
  @IsEmail() email!: string;
  @IsString() password!: string;
}

class ValidateAgentCodeDto {
  @IsString() @Length(1, 16) code!: string;
}

class VerifyAgentBankAccountDto {
  @IsString() @Matches(/^\d{10}$/) accountNumber!: string;
  @IsString() @Matches(/^\d{2,10}$/) bankCode!: string;
}

class RejectAgentDto {
  @IsOptional() @IsString() reason?: string;
}

class SetAgentRateDto {
  /** Pass `null` to clear the override and revert to the global rate. */
  @IsOptional() @IsInt() @Min(0) @Max(10000) bps?: number | null;
}

class SetGlobalRateDto {
  @IsInt() @Min(0) @Max(10000) bps!: number;
}

@Controller({ path: 'agents', version: '1' })
export class AgentsController {
  constructor(
    private readonly agentsService: AgentsService,
    private readonly authService: AuthService,
    private readonly paystack: PaystackProvider,
  ) {}

  // ─────────────────────────────────────────────────────────
  // Public — storefront /agent/* surface
  // ─────────────────────────────────────────────────────────

  /**
   * Sign up as a marketing agent. Creates a User with role
   * MARKETING_AGENT and a MarketingAgent row in PENDING_APPROVAL. We do
   * NOT issue tokens here — the user cannot log in until the super
   * admin approves them, and we don't want to dangle a JWT for an
   * account that can't do anything.
   */
  @Public()
  @Post('signup')
  async signup(@Body() dto: AgentSignupDto) {
    const agent = await this.agentsService.createAgent({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      phone: dto.phone,
      password: dto.password,
      bankCode: dto.bankCode,
      bankAccountNumber: dto.bankAccountNumber,
    });
    return {
      data: {
        id: agent.id,
        code: agent.code,
        status: agent.status,
        bankAccountName: agent.bankAccountName,
        message:
          'Application submitted. You will be notified when the super admin reviews your account.',
      },
    };
  }

  /**
   * Agent login. Separate endpoint from /auth/login so the storefront
   * customer flow is never touched. Returns a normal token pair on
   * success — the JWT carries role=MARKETING_AGENT which restricts the
   * agent to AGENT_SELF-gated endpoints.
   */
  @Public()
  @Post('login')
  async login(@Body() dto: AgentLoginDto) {
    const { user } = await this.agentsService.authenticateForLogin(
      dto.email,
      dto.password,
    );
    const tokens = await this.authService.generateTokenPair(user);
    return {
      data: {
        ...tokens,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        },
      },
    };
  }

  /**
   * Paystack bank list — needed by the agent signup form. Open so
   * unauthenticated visitors filling out the signup wizard can pick a
   * bank without first creating a customer account. The list itself
   * isn't sensitive.
   */
  @Public()
  @Get('banks')
  async listBanks() {
    const banks = await this.paystack.listBanks();
    return { data: banks };
  }

  /**
   * Resolve an agent's name from their bank account during signup. Same
   * Paystack endpoint as /refunds/verify-bank-account but exposed
   * publicly so the signup form works without auth.
   */
  @Public()
  @Post('verify-bank-account')
  async verifyBankAccount(@Body() dto: VerifyAgentBankAccountDto) {
    const res = await this.paystack.resolveBankAccount({
      accountNumber: dto.accountNumber,
      bankCode: dto.bankCode,
    });
    if ('error' in res) {
      return { data: { ok: false, error: res.error } };
    }
    return { data: { ok: true, accountName: res.accountName } };
  }

  /**
   * Validate an agent code at the till / checkout. Open to any
   * authenticated user — the caller proves a session, the server
   * returns just the agent name so the cashier / customer can confirm.
   */
  @UseGuards(JwtAuthGuard)
  @Post('validate-code')
  async validateCode(@Body() dto: ValidateAgentCodeDto) {
    const data = await this.agentsService.validateAgentCode(dto.code);
    return { data };
  }

  // ─────────────────────────────────────────────────────────
  // Agent — own dashboard
  // ─────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @RequirePermissions(Permission.AGENT_SELF)
  @Get('me/dashboard')
  async myDashboard(@CurrentUser() user: User) {
    const agent = await this.agentsService.findByUserId(user.id);
    const data = await this.agentsService.dashboard(agent.id);
    return { data };
  }

  @UseGuards(JwtAuthGuard)
  @RequirePermissions(Permission.AGENT_SELF)
  @Get('me/attributions')
  async myAttributions(
    @CurrentUser() user: User,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const agent = await this.agentsService.findByUserId(user.id);
    const data = await this.agentsService.listAttributionsForAgent(
      agent.id,
      page ? parseInt(page, 10) || 1 : 1,
      limit ? parseInt(limit, 10) || 20 : 20,
    );
    return { data };
  }

  @UseGuards(JwtAuthGuard)
  @RequirePermissions(Permission.AGENT_SELF)
  @Get('me/payouts')
  async myPayouts(
    @CurrentUser() user: User,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const agent = await this.agentsService.findByUserId(user.id);
    const data = await this.agentsService.listPayoutsForAgent(
      agent.id,
      page ? parseInt(page, 10) || 1 : 1,
      limit ? parseInt(limit, 10) || 20 : 20,
    );
    return { data };
  }

  // ─────────────────────────────────────────────────────────
  // Super admin — list + decide + commission + payout
  // ─────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @RequirePermissions(Permission.AGENTS_VIEW)
  @Get()
  async list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    const data = await this.agentsService.list({
      page: page ? parseInt(page, 10) || 1 : 1,
      limit: limit ? parseInt(limit, 10) || 20 : 20,
      status: status ? (status as AgentStatus) : undefined,
      search: search || undefined,
    });
    return { data };
  }

  @UseGuards(JwtAuthGuard)
  @RequirePermissions(Permission.AGENTS_VIEW)
  @Get('commission/global')
  async getGlobalRate() {
    const bps = await this.agentsService.getGlobalRateBps();
    return { data: { bps } };
  }

  @UseGuards(JwtAuthGuard)
  @RequirePermissions(Permission.AGENTS_COMMISSION_SET)
  @Post('commission/global')
  async setGlobalRate(
    @Body() dto: SetGlobalRateDto,
    @CurrentUser() user: User,
  ) {
    const bps = await this.agentsService.setGlobalRateBps(dto.bps, user.id);
    return { data: { bps } };
  }

  @UseGuards(JwtAuthGuard)
  @RequirePermissions(Permission.AGENTS_VIEW)
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const agent = await this.agentsService.findById(id);
    const data = await this.agentsService.dashboard(agent.id);
    return { data };
  }

  @UseGuards(JwtAuthGuard)
  @RequirePermissions(Permission.AGENTS_VIEW)
  @Get(':id/attributions')
  async attributionsForAgent(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.agentsService.listAttributionsForAgent(
      id,
      page ? parseInt(page, 10) || 1 : 1,
      limit ? parseInt(limit, 10) || 20 : 20,
    );
    return { data };
  }

  @UseGuards(JwtAuthGuard)
  @RequirePermissions(Permission.AGENTS_APPROVE)
  @Post(':id/approve')
  async approve(@Param('id') id: string, @CurrentUser() user: User) {
    const data = await this.agentsService.approve(id, user.id);
    return { data };
  }

  @UseGuards(JwtAuthGuard)
  @RequirePermissions(Permission.AGENTS_APPROVE)
  @Post(':id/reject')
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectAgentDto,
    @CurrentUser() user: User,
  ) {
    const data = await this.agentsService.reject(id, user.id, dto.reason);
    return { data };
  }

  @UseGuards(JwtAuthGuard)
  @RequirePermissions(Permission.AGENTS_APPROVE)
  @Post(':id/suspend')
  async suspend(
    @Param('id') id: string,
    @Body() dto: RejectAgentDto,
    @CurrentUser() user: User,
  ) {
    const data = await this.agentsService.suspend(id, user.id, dto.reason);
    return { data };
  }

  @UseGuards(JwtAuthGuard)
  @RequirePermissions(Permission.AGENTS_COMMISSION_SET)
  @Post(':id/commission')
  async setAgentRate(
    @Param('id') id: string,
    @Body() dto: SetAgentRateDto,
  ) {
    const data = await this.agentsService.setAgentRateBps(
      id,
      dto.bps === undefined ? null : dto.bps,
    );
    return { data };
  }

  @UseGuards(JwtAuthGuard)
  @RequirePermissions(Permission.AGENTS_PAYOUT)
  @Post(':id/payout')
  async payout(@Param('id') id: string, @CurrentUser() user: User) {
    const data = await this.agentsService.initiatePayout(id, user.id);
    return { data };
  }
}
