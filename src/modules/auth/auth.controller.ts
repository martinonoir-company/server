import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService, TokenPair, TotpSetupResult } from './auth.service';
import {
  RegisterDto,
  LoginDto,
  RefreshTokenDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  VerifyEmailDto,
  ResendVerificationDto,
  SetupTotpDto,
  DisableTotpDto,
} from './dto/auth.dto';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { Public } from '../../shared/decorators/public.decorator';
import { User, UserRole } from '../users/entities/user.entity';
import { Request } from 'express';

/**
 * Password reset here covers every portal EXCEPT the marketing-agent one:
 * customers (storefront + mobile) and staff/admins (admin frontend) all reset
 * through /auth. Agents have their own portal and reset via /agents, so they
 * are deliberately excluded — that keeps the reset link they receive pointing
 * at /agent/reset-password and prevents either portal from redeeming the
 * other's token. See AuthService.forgotPassword.
 */
const NON_AGENT_RESET_SCOPE = {
  roles: [
    UserRole.CUSTOMER,
    UserRole.COMPANY_STAFF,
    UserRole.COMPANY_SUPER_ADMIN,
    UserRole.SUPER_ADMIN,
  ],
  resetPath: '/reset-password',
  portalLabel: 'Martino Noir account',
};

@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ── Register — 5 per 10 min per IP ──
  @Public()
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 600000 } })
  async register(@Body() dto: RegisterDto): Promise<{ data: TokenPair }> {
    const tokens = await this.authService.register(dto);
    return { data: tokens };
  }

  // ── Login — 10 per minute per IP ──
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
  ): Promise<{ data: TokenPair }> {
    const ipAddress = req.ip ?? req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    const tokens = await this.authService.login(dto, ipAddress, userAgent);
    return { data: tokens };
  }

  // ── Refresh — 30 per minute ──
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
  ): Promise<{ data: TokenPair }> {
    const ipAddress = req.ip ?? req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    const tokens = await this.authService.refreshTokens(
      dto.refreshToken,
      ipAddress,
      userAgent,
    );
    return { data: tokens };
  }

  // ── Logout current session ──
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() dto: RefreshTokenDto): Promise<void> {
    await this.authService.logout(dto.refreshToken);
  }

  // ── Logout all sessions (requires JWT) ──
  @UseGuards(JwtAuthGuard)
  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logoutAll(@CurrentUser() user: User): Promise<void> {
    await this.authService.logoutAll(user.id);
  }

  // ── Forgot password — 3 per 10 min ──
  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 600000 } })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
  ): Promise<{ message: string }> {
    await this.authService.forgotPassword(dto, NON_AGENT_RESET_SCOPE);
    return {
      message:
        'If an account with that email exists, a reset link has been sent.',
    };
  }

  // ── Reset password — 5 per 10 min ──
  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 600000 } })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    await this.authService.resetPassword(dto, {
      roles: NON_AGENT_RESET_SCOPE.roles,
    });
    return { message: 'Password reset successfully. Please log in.' };
  }

  // ── Verify email ──
  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async verifyEmail(
    @Body() dto: VerifyEmailDto,
  ): Promise<{ message: string }> {
    await this.authService.verifyEmail(dto);
    return { message: 'Email verified successfully.' };
  }

  // ── Resend verification — 3 per 10 min ──
  @Public()
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 600000 } })
  async resendVerification(
    @Body() dto: ResendVerificationDto,
  ): Promise<{ message: string }> {
    await this.authService.resendVerificationEmail(dto.email);
    return {
      message:
        'If your email is registered and unverified, a new link has been sent.',
    };
  }

  // ── TOTP: Initiate setup (returns QR code) ──
  @UseGuards(JwtAuthGuard)
  @Post('2fa/setup')
  async setupTotp(
    @CurrentUser() user: User,
  ): Promise<{ data: TotpSetupResult }> {
    const result = await this.authService.initiateTotpSetup(user.id);
    return { data: result };
  }

  // ── TOTP: Confirm setup with first code ──
  @UseGuards(JwtAuthGuard)
  @Post('2fa/confirm')
  async confirmTotp(
    @CurrentUser() user: User,
    @Body() dto: SetupTotpDto,
  ): Promise<{ data: { backupCodes: string[] } }> {
    const backupCodes = await this.authService.confirmTotpSetup(user.id, dto);
    return { data: { backupCodes } };
  }

  // ── TOTP: Disable ──
  @UseGuards(JwtAuthGuard)
  @Delete('2fa')
  @HttpCode(HttpStatus.NO_CONTENT)
  async disableTotp(
    @CurrentUser() user: User,
    @Body() dto: DisableTotpDto,
  ): Promise<void> {
    await this.authService.disableTotp(user.id, dto);
  }

  // ── Get 2FA status ──
  @UseGuards(JwtAuthGuard)
  @Get('2fa/status')
  async getTotpStatus(
    @CurrentUser() user: User,
  ): Promise<{ data: { enabled: boolean; emailVerified: boolean } }> {
    return {
      data: {
        enabled: user.twoFactorEnabled,
        emailVerified: user.emailVerified,
      },
    };
  }
}
