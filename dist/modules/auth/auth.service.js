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
var AuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const jwt_1 = require("@nestjs/jwt");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const argon2 = __importStar(require("argon2"));
const crypto = __importStar(require("crypto"));
const otplib_1 = require("otplib");
const qrcode = __importStar(require("qrcode"));
const user_entity_1 = require("../users/entities/user.entity");
const refresh_token_entity_1 = require("./entities/refresh-token.entity");
const password_reset_token_entity_1 = require("./entities/password-reset-token.entity");
const email_verification_token_entity_1 = require("./entities/email-verification-token.entity");
const base_entity_1 = require("../../shared/entities/base.entity");
const email_service_1 = require("../notifications/email.service");
const ARGON2_OPTIONS = {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
};
let AuthService = AuthService_1 = class AuthService {
    constructor(userRepo, rtRepo, prtRepo, evtRepo, jwtService, configService, emailService, dataSource) {
        this.userRepo = userRepo;
        this.rtRepo = rtRepo;
        this.prtRepo = prtRepo;
        this.evtRepo = evtRepo;
        this.jwtService = jwtService;
        this.configService = configService;
        this.emailService = emailService;
        this.dataSource = dataSource;
        this.logger = new common_1.Logger(AuthService_1.name);
        this.ACCESS_TOKEN_EXPIRY = '15m';
        this.REFRESH_TOKEN_DAYS = 7;
        this.MAX_FAILED_ATTEMPTS = 5;
        this.LOCKOUT_MINUTES = 15;
        this.PASSWORD_RESET_EXPIRY_MINUTES = 30;
        this.EMAIL_VERIFY_EXPIRY_HOURS = 24;
        this.STAFF_INVITE_EXPIRY_HOURS = 48;
    }
    async register(dto) {
        const existing = await this.userRepo.findOne({
            where: { email: dto.email.toLowerCase() },
        });
        if (existing) {
            throw new common_1.ConflictException('An account with this email already exists');
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
            role: user_entity_1.UserRole.CUSTOMER,
            emailVerified: false,
        });
        await this.userRepo.save(user);
        this.sendVerificationEmail(user).catch((err) => this.logger.error(`Failed to send verification email to ${user.email}: ${err.message}`));
        this.emailService
            .sendWelcome(user.email, user.firstName)
            .catch((err) => this.logger.error(`Welcome email failed: ${err.message}`));
        return this.generateTokenPair(user);
    }
    async login(dto, ipAddress, userAgent) {
        const user = await this.userRepo
            .createQueryBuilder('user')
            .addSelect('user.passwordHash')
            .addSelect('user.totpSecret')
            .where('user.email = :email', { email: dto.email.toLowerCase() })
            .getOne();
        if (!user) {
            await argon2.hash('dummy-prevent-timing-attack', ARGON2_OPTIONS);
            throw new common_1.UnauthorizedException('Invalid email or password');
        }
        if (user.lockedUntil && user.lockedUntil > new Date()) {
            const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
            throw new common_1.ForbiddenException(`Account locked. Try again in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.`);
        }
        const validPassword = await argon2.verify(user.passwordHash, dto.password);
        if (!validPassword) {
            await this.handleFailedLogin(user, ipAddress);
            throw new common_1.UnauthorizedException('Invalid email or password');
        }
        if (user.twoFactorEnabled) {
            if (!dto.totpCode) {
                throw new common_1.BadRequestException('Two-factor authentication code required');
            }
            if (!user.totpSecret) {
                throw new common_1.BadRequestException('TOTP not configured on this account');
            }
            const totpResult = (0, otplib_1.verifySync)({ token: dto.totpCode, secret: user.totpSecret });
            const isValidTotp = typeof totpResult === 'object' ? totpResult.valid : totpResult;
            if (!isValidTotp) {
                const isBackupCode = await this.verifyAndConsumeBackupCode(user, dto.totpCode);
                if (!isBackupCode) {
                    await this.handleFailedLogin(user, ipAddress);
                    throw new common_1.UnauthorizedException('Invalid two-factor authentication code');
                }
            }
        }
        await this.userRepo.update(user.id, {
            failedLoginAttempts: 0,
            lockedUntil: undefined,
            lastLoginAt: new Date(),
        });
        return this.generateTokenPair(user, ipAddress, userAgent);
    }
    async refreshTokens(oldRefreshToken, ipAddress, userAgent) {
        const tokenHash = this.hashToken(oldRefreshToken);
        const stored = await this.rtRepo.findOne({
            where: { tokenHash },
            relations: ['user'],
        });
        if (!stored) {
            throw new common_1.UnauthorizedException('Invalid refresh token');
        }
        if (stored.revoked) {
            this.logger.warn(`Refresh token reuse detected — family=${stored.family}, userId=${stored.userId}`);
            await this.rtRepo.update({ family: stored.family }, { revoked: true });
            throw new common_1.UnauthorizedException('Refresh token reuse detected — all sessions revoked for security');
        }
        if (stored.isExpired) {
            await this.rtRepo.update(stored.id, { revoked: true });
            throw new common_1.UnauthorizedException('Refresh token expired');
        }
        await this.rtRepo.update(stored.id, { revoked: true });
        return this.generateTokenPair(stored.user, ipAddress, userAgent, stored.family);
    }
    async logout(refreshToken) {
        const tokenHash = this.hashToken(refreshToken);
        await this.rtRepo.update({ tokenHash }, { revoked: true });
    }
    async logoutAll(userId) {
        await this.rtRepo.update({ userId }, { revoked: true });
    }
    async verifyEmail(dto) {
        const tokenHash = this.hashToken(dto.token);
        const record = await this.evtRepo.findOne({
            where: { tokenHash },
            relations: ['user'],
        });
        if (!record) {
            throw new common_1.BadRequestException('Invalid or expired verification link');
        }
        if (record.used) {
            throw new common_1.BadRequestException('Verification link already used');
        }
        if (record.isExpired) {
            throw new common_1.BadRequestException('Verification link expired — request a new one');
        }
        record.used = true;
        await this.evtRepo.save(record);
        await this.userRepo.update(record.userId, { emailVerified: true });
    }
    async resendVerificationEmail(email) {
        const user = await this.userRepo.findOne({
            where: { email: email.toLowerCase() },
        });
        if (!user || user.emailVerified)
            return;
        await this.evtRepo
            .createQueryBuilder()
            .update()
            .set({ used: true })
            .where('userId = :userId AND used = false', { userId: user.id })
            .execute();
        await this.sendVerificationEmail(user);
    }
    async forgotPassword(dto, scope) {
        const user = await this.userRepo.findOne({
            where: scope
                ? { email: dto.email.toLowerCase().trim(), role: (0, typeorm_2.In)(scope.roles) }
                : { email: dto.email.toLowerCase().trim() },
        });
        if (!user)
            return;
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
            expiresAt: new Date(Date.now() + this.PASSWORD_RESET_EXPIRY_MINUTES * 60 * 1000),
        });
        await this.prtRepo.save(prt);
        await this.emailService.sendPasswordReset(user.email, rawToken, this.PASSWORD_RESET_EXPIRY_MINUTES, scope?.resetPath, scope?.portalLabel);
    }
    async resetPassword(dto, scope) {
        const tokenHash = this.hashToken(dto.token);
        const record = await this.prtRepo.findOne({
            where: { tokenHash },
            relations: ['user'],
        });
        if (!record) {
            throw new common_1.BadRequestException('Invalid or expired reset link');
        }
        if (record.used) {
            throw new common_1.BadRequestException('Reset link already used');
        }
        if (record.isExpired) {
            throw new common_1.BadRequestException('Reset link expired — request a new one');
        }
        if (scope && (!record.user || !scope.roles.includes(record.user.role))) {
            throw new common_1.BadRequestException('Invalid or expired reset link');
        }
        const passwordHash = await argon2.hash(dto.newPassword, ARGON2_OPTIONS);
        record.used = true;
        await this.prtRepo.save(record);
        await this.userRepo.update(record.userId, { passwordHash });
        await this.rtRepo.update({ userId: record.userId }, { revoked: true });
    }
    async initiateTotpSetup(userId) {
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        if (user.twoFactorEnabled) {
            throw new common_1.ConflictException('Two-factor authentication is already enabled');
        }
        const secret = (0, otplib_1.generateSecret)();
        const issuer = 'Martinonoir';
        const otpauthUrl = (0, otplib_1.generateURI)({ strategy: 'totp', issuer, label: user.email, secret });
        const qrCodeDataUrl = await qrcode.toDataURL(otpauthUrl);
        await this.userRepo
            .createQueryBuilder()
            .update(user_entity_1.User)
            .set({ totpSecret: secret })
            .where('id = :id', { id: userId })
            .execute();
        return { secret, otpauthUrl, qrCodeDataUrl };
    }
    async confirmTotpSetup(userId, dto) {
        const user = await this.userRepo
            .createQueryBuilder('user')
            .addSelect('user.totpSecret')
            .where('user.id = :id', { id: userId })
            .getOne();
        if (!user)
            throw new common_1.NotFoundException('User not found');
        if (user.twoFactorEnabled) {
            throw new common_1.ConflictException('TOTP already enabled');
        }
        if (!user.totpSecret) {
            throw new common_1.BadRequestException('TOTP setup not initiated — call /auth/2fa/setup first');
        }
        const verifyResult = (0, otplib_1.verifySync)({ token: dto.totpCode, secret: user.totpSecret });
        const isValid = typeof verifyResult === 'object' ? verifyResult.valid : verifyResult;
        if (!isValid) {
            throw new common_1.UnauthorizedException('Invalid TOTP code');
        }
        const backupCodes = Array.from({ length: 8 }, () => crypto.randomBytes(5).toString('hex').toUpperCase());
        await this.userRepo.update(userId, {
            twoFactorEnabled: true,
            backupCodes,
        });
        await this.rtRepo.update({ userId }, { revoked: true });
        return backupCodes;
    }
    async disableTotp(userId, dto) {
        const user = await this.userRepo
            .createQueryBuilder('user')
            .addSelect('user.passwordHash')
            .addSelect('user.totpSecret')
            .where('user.id = :id', { id: userId })
            .getOne();
        if (!user)
            throw new common_1.NotFoundException('User not found');
        if (!user.twoFactorEnabled) {
            throw new common_1.BadRequestException('Two-factor authentication is not enabled');
        }
        const validPassword = await argon2.verify(user.passwordHash, dto.currentPassword);
        if (!validPassword) {
            throw new common_1.UnauthorizedException('Invalid password');
        }
        if (dto.totpCode && user.totpSecret) {
            const disableVerifyResult = (0, otplib_1.verifySync)({ token: dto.totpCode, secret: user.totpSecret });
            const validTotp = typeof disableVerifyResult === 'object' ? disableVerifyResult.valid : disableVerifyResult;
            if (!validTotp) {
                throw new common_1.UnauthorizedException('Invalid TOTP code');
            }
        }
        await this.userRepo.update(userId, {
            twoFactorEnabled: false,
            totpSecret: undefined,
            backupCodes: undefined,
        });
    }
    async createStaffAccount(dto, inviterName) {
        const existing = await this.userRepo.findOne({
            where: { email: dto.email.toLowerCase() },
        });
        if (existing) {
            throw new common_1.ConflictException('An account with this email already exists');
        }
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
        const rawToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = this.hashToken(rawToken);
        const prt = this.prtRepo.create({
            userId: user.id,
            tokenHash,
            expiresAt: new Date(Date.now() + this.STAFF_INVITE_EXPIRY_HOURS * 60 * 60 * 1000),
        });
        await this.prtRepo.save(prt);
        await this.emailService.sendStaffInvitation(user.email, user.firstName, inviterName, dto.role, rawToken);
        return user;
    }
    async sendVerificationEmail(user) {
        const rawToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = this.hashToken(rawToken);
        const evt = this.evtRepo.create({
            userId: user.id,
            tokenHash,
            expiresAt: new Date(Date.now() + this.EMAIL_VERIFY_EXPIRY_HOURS * 60 * 60 * 1000),
        });
        await this.evtRepo.save(evt);
        await this.emailService.sendEmailVerification(user.email, user.firstName, rawToken, this.EMAIL_VERIFY_EXPIRY_HOURS);
    }
    async handleFailedLogin(user, ipAddress) {
        const attempts = user.failedLoginAttempts + 1;
        const update = { failedLoginAttempts: attempts };
        if (attempts >= this.MAX_FAILED_ATTEMPTS) {
            update.lockedUntil = new Date(Date.now() + this.LOCKOUT_MINUTES * 60 * 1000);
            update.failedLoginAttempts = 0;
            this.emailService
                .sendAccountLockAlert(user.email, user.firstName, this.LOCKOUT_MINUTES, ipAddress)
                .catch((err) => this.logger.error(`Lock alert email failed for ${user.email}: ${err.message}`));
        }
        await this.userRepo.update(user.id, update);
    }
    async verifyAndConsumeBackupCode(user, code) {
        const fullUser = await this.userRepo
            .createQueryBuilder('user')
            .addSelect('user.backupCodes')
            .where('user.id = :id', { id: user.id })
            .getOne();
        if (!fullUser?.backupCodes?.length)
            return false;
        const upperCode = code.toUpperCase();
        const idx = fullUser.backupCodes.indexOf(upperCode);
        if (idx === -1)
            return false;
        const remaining = [...fullUser.backupCodes];
        remaining.splice(idx, 1);
        await this.userRepo.update(user.id, { backupCodes: remaining });
        return true;
    }
    async generateTokenPair(user, ipAddress, userAgent, family) {
        const payload = {
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
        const tokenFamily = family ?? (0, base_entity_1.generateUlid)();
        const refreshToken = this.rtRepo.create({
            userId: user.id,
            tokenHash,
            family: tokenFamily,
            expiresAt: new Date(Date.now() + this.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000),
            ipAddress,
            userAgent: userAgent?.substring(0, 512),
        });
        await this.rtRepo.save(refreshToken);
        return { accessToken, refreshToken: rawRefreshToken, expiresIn: 900 };
    }
    async deleteAccount(userId) {
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user) {
            return;
        }
        if (user.role !== user_entity_1.UserRole.CUSTOMER) {
            throw new common_1.ForbiddenException('Only customer accounts can be deleted here. Staff and marketing ' +
                'agent accounts must be closed by support to protect payout and ' +
                'operational records.');
        }
        await this.dataSource.transaction(async (manager) => {
            await manager.query('UPDATE orders SET "userId" = NULL WHERE "userId" = $1', [userId]);
            const perUserTables = [
                'cart_items',
                'wishlist_items',
                'push_tokens',
                'refresh_tokens',
                'email_verification_tokens',
                'password_reset_tokens',
                'customers',
            ];
            for (const table of perUserTables) {
                await manager.query(`DELETE FROM ${table} WHERE "userId" = $1`, [
                    userId,
                ]);
            }
            const tombstone = `deleted+${userId}@deleted.martinonoir.local`;
            await manager.update(user_entity_1.User, { id: userId }, {
                email: tombstone,
                firstName: 'Deleted',
                lastName: 'User',
                phone: undefined,
                avatarUrl: undefined,
                passwordHash: '',
                totpSecret: undefined,
                twoFactorEnabled: false,
                backupCodes: undefined,
                emailVerified: false,
                permissions: undefined,
            });
            await manager.softDelete(user_entity_1.User, userId);
        });
        this.logger.log(`Customer account ${userId} deleted (anonymized).`);
    }
    hashToken(token) {
        return crypto.createHash('sha256').update(token).digest('hex');
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = AuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __param(1, (0, typeorm_1.InjectRepository)(refresh_token_entity_1.RefreshToken)),
    __param(2, (0, typeorm_1.InjectRepository)(password_reset_token_entity_1.PasswordResetToken)),
    __param(3, (0, typeorm_1.InjectRepository)(email_verification_token_entity_1.EmailVerificationToken)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        jwt_1.JwtService,
        config_1.ConfigService,
        email_service_1.EmailService,
        typeorm_2.DataSource])
], AuthService);
//# sourceMappingURL=auth.service.js.map