import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { generateSecret as otpGenerateSecret, generateSync as otpGenerateSync, verifySync as otpVerifySync, generateURI as otpGenerateURI } from 'otplib';
import * as qrcode from 'qrcode';

import { User, UserRole } from '../users/entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { EmailVerificationToken } from './entities/email-verification-token.entity';
import {
  RegisterDto,
  LoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  VerifyEmailDto,
  SetupTotpDto,
  DisableTotpDto,
} from './dto/auth.dto';
import { generateUlid } from '../../shared/entities/base.entity';
import { EmailService } from '../notifications/email.service';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  country: string;
  currency: 'NGN' | 'USD';
}

export interface TotpSetupResult {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
}

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  private readonly ACCESS_TOKEN_EXPIRY = '15m';
  private readonly REFRESH_TOKEN_DAYS = 7;
  private readonly MAX_FAILED_ATTEMPTS = 5;
  private readonly LOCKOUT_MINUTES = 15;
  private readonly PASSWORD_RESET_EXPIRY_MINUTES = 30;
  private readonly EMAIL_VERIFY_EXPIRY_HOURS = 24;
  private readonly STAFF_INVITE_EXPIRY_HOURS = 48;

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(RefreshToken) private readonly rtRepo: Repository<RefreshToken>,
    @InjectRepository(PasswordResetToken) private readonly prtRepo: Repository<PasswordResetToken>,
    @InjectRepository(EmailVerificationToken) private readonly evtRepo: Repository<EmailVerificationToken>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  // ─────────────────────────────────────────────────────────────
  // REGISTER
  // ─────────────────────────────────────────────────────────────

  async register(dto: RegisterDto): Promise<TokenPair> {
    const existing = await this.userRepo.findOne({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await argon2.hash(dto.password, ARGON2_OPTIONS);
    const countryCode = (dto.countryCode ?? 'NG').toUpperCase();
    const preferredCurrency = countryCode === 'NG' ? 'NGN' : 'USD';

    const user = this.userRepo.create({
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      email: dto.email.toLowerCase().trim(),
      passwordHash,
      phone: dto.phone,
      countryCode,
      preferredCurrency,
      role: UserRole.CUSTOMER,
      emailVerified: false,
    });

    await this.userRepo.save(user);

    // Send verification email (non-blocking — don't fail registration if email fails)
    this.sendVerificationEmail(user).catch((err) =>
      this.logger.error(`Failed to send verification email to ${user.email}: ${err.message}`),
    );

    // Send welcome email (non-blocking)
    this.emailService
      .sendWelcome(user.email, user.firstName)
      .catch((err) => this.logger.error(`Welcome email failed: ${err.message}`));

    return this.generateTokenPair(user);
  }

  // ─────────────────────────────────────────────────────────────
  // LOGIN
  // ─────────────────────────────────────────────────────────────

  async login(dto: LoginDto, ipAddress?: string, userAgent?: string): Promise<TokenPair> {
    const user = await this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .addSelect('user.totpSecret')
      .where('user.email = :email', { email: dto.email.toLowerCase() })
      .getOne();

    if (!user) {
      // Constant-time response to prevent user enumeration
      await argon2.hash('dummy-prevent-timing-attack', ARGON2_OPTIONS);
      throw new UnauthorizedException('Invalid email or password');
    }

    // Check account lockout
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / 60000,
      );
      throw new ForbiddenException(
        `Account locked. Try again in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.`,
      );
    }

    // Verify password
    const validPassword = await argon2.verify(user.passwordHash, dto.password);
    if (!validPassword) {
      await this.handleFailedLogin(user, ipAddress);
      throw new UnauthorizedException('Invalid email or password');
    }

    // TOTP verification (if enabled)
    if (user.twoFactorEnabled) {
      if (!dto.totpCode) {
        throw new BadRequestException('Two-factor authentication code required');
      }
      if (!user.totpSecret) {
        throw new BadRequestException('TOTP not configured on this account');
      }

      const totpResult = otpVerifySync({ token: dto.totpCode, secret: user.totpSecret });
      const isValidTotp = typeof totpResult === 'object' ? totpResult.valid : totpResult;

      if (!isValidTotp) {
        // Check backup codes
        const isBackupCode = await this.verifyAndConsumeBackupCode(user, dto.totpCode);
        if (!isBackupCode) {
          await this.handleFailedLogin(user, ipAddress);
          throw new UnauthorizedException('Invalid two-factor authentication code');
        }
      }
    }

    // Reset failed attempts on successful login
    await this.userRepo.update(user.id, {
      failedLoginAttempts: 0,
      lockedUntil: undefined,
      lastLoginAt: new Date(),
    });

    return this.generateTokenPair(user, ipAddress, userAgent);
  }

  // ─────────────────────────────────────────────────────────────
  // REFRESH TOKEN ROTATION
  // ─────────────────────────────────────────────────────────────

  async refreshTokens(
    oldRefreshToken: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<TokenPair> {
    const tokenHash = this.hashToken(oldRefreshToken);

    const stored = await this.rtRepo.findOne({
      where: { tokenHash },
      relations: ['user'],
    });

    if (!stored) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Detect reuse — revoke entire family and alert
    if (stored.revoked) {
      this.logger.warn(
        `Refresh token reuse detected — family=${stored.family}, userId=${stored.userId}`,
      );
      await this.rtRepo.update({ family: stored.family }, { revoked: true });
      throw new UnauthorizedException(
        'Refresh token reuse detected — all sessions revoked for security',
      );
    }

    if (stored.isExpired) {
      await this.rtRepo.update(stored.id, { revoked: true });
      throw new UnauthorizedException('Refresh token expired');
    }

    // Revoke old, issue new pair with same family
    await this.rtRepo.update(stored.id, { revoked: true });
    return this.generateTokenPair(stored.user, ipAddress, userAgent, stored.family);
  }

  // ─────────────────────────────────────────────────────────────
  // LOGOUT
  // ─────────────────────────────────────────────────────────────

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    await this.rtRepo.update({ tokenHash }, { revoked: true });
  }

  async logoutAll(userId: string): Promise<void> {
    await this.rtRepo.update({ userId }, { revoked: true });
  }

  // ─────────────────────────────────────────────────────────────
  // EMAIL VERIFICATION
  // ─────────────────────────────────────────────────────────────

  async verifyEmail(dto: VerifyEmailDto): Promise<void> {
    const tokenHash = this.hashToken(dto.token);

    const record = await this.evtRepo.findOne({
      where: { tokenHash },
      relations: ['user'],
    });

    if (!record) {
      throw new BadRequestException('Invalid or expired verification link');
    }
    if (record.used) {
      throw new BadRequestException('Verification link already used');
    }
    if (record.isExpired) {
      throw new BadRequestException('Verification link expired — request a new one');
    }

    // Mark token used + verify user
    record.used = true;
    await this.evtRepo.save(record);
    await this.userRepo.update(record.userId, { emailVerified: true });
  }

  async resendVerificationEmail(email: string): Promise<void> {
    const user = await this.userRepo.findOne({
      where: { email: email.toLowerCase() },
    });

    // Always return 200 to prevent user enumeration
    if (!user || user.emailVerified) return;

    // Invalidate previous tokens
    await this.evtRepo
      .createQueryBuilder()
      .update()
      .set({ used: true })
      .where('userId = :userId AND used = false', { userId: user.id })
      .execute();

    await this.sendVerificationEmail(user);
  }

  // ─────────────────────────────────────────────────────────────
  // PASSWORD RESET
  // ─────────────────────────────────────────────────────────────

  /**
   * The customer/staff storefront and the marketing-agent portal share this
   * one reset-token implementation, because an agent IS a User row carrying
   * role=MARKETING_AGENT. `scope` is what keeps the two flows from colliding:
   *
   *  - forgotPassword only mails a link for an account whose role the calling
   *    portal owns, so /auth (customers, staff, admins) never mints a link for
   *    an agent and /agents never mints one for a non-agent. A miss stays a
   *    silent 200 — no account enumeration.
   *  - resetPassword refuses a token whose owner's role the portal does not
   *    own, so a link issued by one portal cannot be redeemed in the other
   *    even though both read the same password_reset_tokens table.
   *
   * Roles are matched with an explicit allow-list rather than a single role so
   * that /auth keeps serving CUSTOMER, COMPANY_STAFF and both admin roles.
   */
  async forgotPassword(
    dto: ForgotPasswordDto,
    scope?: {
      roles: UserRole[];
      resetPath: string;
      portalLabel: string;
    },
  ): Promise<void> {
    const user = await this.userRepo.findOne({
      where: scope
        ? { email: dto.email.toLowerCase().trim(), role: In(scope.roles) }
        : { email: dto.email.toLowerCase().trim() },
    });

    // Always return 200 — never reveal if email exists
    if (!user) return;

    // Invalidate previous reset tokens
    await this.prtRepo
      .createQueryBuilder()
      .update()
      .set({ used: true })
      .where('userId = :userId AND used = false', { userId: user.id })
      .execute();

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);

    const prt = this.prtRepo.create({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(
        Date.now() + this.PASSWORD_RESET_EXPIRY_MINUTES * 60 * 1000,
      ),
    });
    await this.prtRepo.save(prt);

    await this.emailService.sendPasswordReset(
      user.email,
      rawToken,
      this.PASSWORD_RESET_EXPIRY_MINUTES,
      scope?.resetPath,
      scope?.portalLabel,
    );
  }

  async resetPassword(
    dto: ResetPasswordDto,
    scope?: { roles: UserRole[] },
  ): Promise<void> {
    const tokenHash = this.hashToken(dto.token);

    const record = await this.prtRepo.findOne({
      where: { tokenHash },
      relations: ['user'],
    });

    if (!record) {
      throw new BadRequestException('Invalid or expired reset link');
    }
    if (record.used) {
      throw new BadRequestException('Reset link already used');
    }
    if (record.isExpired) {
      throw new BadRequestException('Reset link expired — request a new one');
    }
    // A token minted by the other portal must not be redeemable here. Same
    // generic message as an unknown token, so this can't be used to probe
    // which portal an email belongs to.
    if (scope && (!record.user || !scope.roles.includes(record.user.role))) {
      throw new BadRequestException('Invalid or expired reset link');
    }

    const passwordHash = await argon2.hash(dto.newPassword, ARGON2_OPTIONS);

    // Mark token used
    record.used = true;
    await this.prtRepo.save(record);

    // Update password
    await this.userRepo.update(record.userId, { passwordHash });

    // Revoke all refresh tokens (force re-login on all devices)
    await this.rtRepo.update({ userId: record.userId }, { revoked: true });
  }

  // ─────────────────────────────────────────────────────────────
  // TOTP / 2FA
  // ─────────────────────────────────────────────────────────────

  async initiateTotpSetup(userId: string): Promise<TotpSetupResult> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.twoFactorEnabled) {
      throw new ConflictException('Two-factor authentication is already enabled');
    }

    const secret = otpGenerateSecret();
    const issuer = 'Martinonoir';
    const otpauthUrl = otpGenerateURI({ strategy: 'totp', issuer, label: user.email, secret });
    const qrCodeDataUrl = await qrcode.toDataURL(otpauthUrl);

    // Store the pending secret (not enabled until verified)
    await this.userRepo
      .createQueryBuilder()
      .update(User)
      .set({ totpSecret: secret } as Partial<User>)
      .where('id = :id', { id: userId })
      .execute();

    return { secret, otpauthUrl, qrCodeDataUrl };
  }

  async confirmTotpSetup(userId: string, dto: SetupTotpDto): Promise<string[]> {
    const user = await this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.totpSecret')
      .where('user.id = :id', { id: userId })
      .getOne();

    if (!user) throw new NotFoundException('User not found');
    if (user.twoFactorEnabled) {
      throw new ConflictException('TOTP already enabled');
    }
    if (!user.totpSecret) {
      throw new BadRequestException('TOTP setup not initiated — call /auth/2fa/setup first');
    }

    const verifyResult = otpVerifySync({ token: dto.totpCode, secret: user.totpSecret });
    const isValid = typeof verifyResult === 'object' ? verifyResult.valid : verifyResult;

    if (!isValid) {
      throw new UnauthorizedException('Invalid TOTP code');
    }

    // Generate 8 backup codes
    const backupCodes = Array.from({ length: 8 }, () =>
      crypto.randomBytes(5).toString('hex').toUpperCase(),
    );

    await this.userRepo.update(userId, {
      twoFactorEnabled: true,
      backupCodes,
    });

    // Revoke all sessions — force re-login with 2FA
    await this.rtRepo.update({ userId }, { revoked: true });

    return backupCodes;
  }

  async disableTotp(userId: string, dto: DisableTotpDto): Promise<void> {
    const user = await this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .addSelect('user.totpSecret')
      .where('user.id = :id', { id: userId })
      .getOne();

    if (!user) throw new NotFoundException('User not found');
    if (!user.twoFactorEnabled) {
      throw new BadRequestException('Two-factor authentication is not enabled');
    }

    const validPassword = await argon2.verify(user.passwordHash, dto.currentPassword);
    if (!validPassword) {
      throw new UnauthorizedException('Invalid password');
    }

    // Optionally require TOTP code to disable (belt-and-suspenders)
    if (dto.totpCode && user.totpSecret) {
      const disableVerifyResult = otpVerifySync({ token: dto.totpCode, secret: user.totpSecret });
      const validTotp = typeof disableVerifyResult === 'object' ? disableVerifyResult.valid : disableVerifyResult;
      if (!validTotp) {
        throw new UnauthorizedException('Invalid TOTP code');
      }
    }

    await this.userRepo.update(userId, {
      twoFactorEnabled: false,
      totpSecret: undefined,
      backupCodes: undefined,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // STAFF CREATION (Super Admin)
  // ─────────────────────────────────────────────────────────────

  async createStaffAccount(
    dto: {
      firstName: string;
      lastName: string;
      email: string;
      role: UserRole;
    },
    inviterName: string,
  ): Promise<User> {
    const existing = await this.userRepo.findOne({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    // Create with a random unusable password — staff must set via invite link
    const tempPassword = crypto.randomBytes(32).toString('hex');
    const passwordHash = await argon2.hash(tempPassword, ARGON2_OPTIONS);

    const user = this.userRepo.create({
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      email: dto.email.toLowerCase().trim(),
      passwordHash,
      role: dto.role,
      countryCode: 'NG',
      preferredCurrency: 'NGN',
      emailVerified: false,
    });

    await this.userRepo.save(user);

    // Generate a long-lived password-reset token as the invitation link
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);

    const prt = this.prtRepo.create({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(
        Date.now() + this.STAFF_INVITE_EXPIRY_HOURS * 60 * 60 * 1000,
      ),
    });
    await this.prtRepo.save(prt);

    // Send invitation email
    await this.emailService.sendStaffInvitation(
      user.email,
      user.firstName,
      inviterName,
      dto.role,
      rawToken,
    );

    return user;
  }

  // ─────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────────

  private async sendVerificationEmail(user: User): Promise<void> {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);

    const evt = this.evtRepo.create({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(
        Date.now() + this.EMAIL_VERIFY_EXPIRY_HOURS * 60 * 60 * 1000,
      ),
    });
    await this.evtRepo.save(evt);

    await this.emailService.sendEmailVerification(
      user.email,
      user.firstName,
      rawToken,
      this.EMAIL_VERIFY_EXPIRY_HOURS,
    );
  }

  private async handleFailedLogin(user: User, ipAddress?: string): Promise<void> {
    const attempts = user.failedLoginAttempts + 1;
    const update: Partial<User> = { failedLoginAttempts: attempts };

    if (attempts >= this.MAX_FAILED_ATTEMPTS) {
      update.lockedUntil = new Date(
        Date.now() + this.LOCKOUT_MINUTES * 60 * 1000,
      );
      update.failedLoginAttempts = 0;

      // Send security alert email (non-blocking)
      this.emailService
        .sendAccountLockAlert(
          user.email,
          user.firstName,
          this.LOCKOUT_MINUTES,
          ipAddress,
        )
        .catch((err) =>
          this.logger.error(`Lock alert email failed for ${user.email}: ${err.message}`),
        );
    }

    await this.userRepo.update(user.id, update);
  }

  private async verifyAndConsumeBackupCode(
    user: User,
    code: string,
  ): Promise<boolean> {
    const fullUser = await this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.backupCodes')
      .where('user.id = :id', { id: user.id })
      .getOne();

    if (!fullUser?.backupCodes?.length) return false;

    const upperCode = code.toUpperCase();
    const idx = fullUser.backupCodes.indexOf(upperCode);
    if (idx === -1) return false;

    // Remove consumed code
    const remaining = [...fullUser.backupCodes];
    remaining.splice(idx, 1);
    await this.userRepo.update(user.id, { backupCodes: remaining });
    return true;
  }

  async generateTokenPair(
    user: User,
    ipAddress?: string,
    userAgent?: string,
    family?: string,
  ): Promise<TokenPair> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      country: user.countryCode,
      currency: user.preferredCurrency,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.ACCESS_TOKEN_EXPIRY,
    });

    const rawRefreshToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawRefreshToken);
    const tokenFamily = family ?? generateUlid();

    const refreshToken = this.rtRepo.create({
      userId: user.id,
      tokenHash,
      family: tokenFamily,
      expiresAt: new Date(
        Date.now() + this.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000,
      ),
      ipAddress,
      userAgent: userAgent?.substring(0, 512),
    });

    await this.rtRepo.save(refreshToken);

    return { accessToken, refreshToken: rawRefreshToken, expiresIn: 900 };
  }

  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
