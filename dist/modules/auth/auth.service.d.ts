import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DataSource, Repository } from 'typeorm';
import { User, UserRole } from '../users/entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { EmailVerificationToken } from './entities/email-verification-token.entity';
import { RegisterDto, LoginDto, ForgotPasswordDto, ResetPasswordDto, VerifyEmailDto, SetupTotpDto, DisableTotpDto } from './dto/auth.dto';
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
export declare class AuthService {
    private readonly userRepo;
    private readonly rtRepo;
    private readonly prtRepo;
    private readonly evtRepo;
    private readonly jwtService;
    private readonly configService;
    private readonly emailService;
    private readonly dataSource;
    private readonly logger;
    private readonly ACCESS_TOKEN_EXPIRY;
    private readonly REFRESH_TOKEN_DAYS;
    private readonly MAX_FAILED_ATTEMPTS;
    private readonly LOCKOUT_MINUTES;
    private readonly PASSWORD_RESET_EXPIRY_MINUTES;
    private readonly EMAIL_VERIFY_EXPIRY_HOURS;
    private readonly STAFF_INVITE_EXPIRY_HOURS;
    constructor(userRepo: Repository<User>, rtRepo: Repository<RefreshToken>, prtRepo: Repository<PasswordResetToken>, evtRepo: Repository<EmailVerificationToken>, jwtService: JwtService, configService: ConfigService, emailService: EmailService, dataSource: DataSource);
    register(dto: RegisterDto): Promise<TokenPair>;
    login(dto: LoginDto, ipAddress?: string, userAgent?: string): Promise<TokenPair>;
    refreshTokens(oldRefreshToken: string, ipAddress?: string, userAgent?: string): Promise<TokenPair>;
    logout(refreshToken: string): Promise<void>;
    logoutAll(userId: string): Promise<void>;
    verifyEmail(dto: VerifyEmailDto): Promise<void>;
    resendVerificationEmail(email: string): Promise<void>;
    forgotPassword(dto: ForgotPasswordDto, scope?: {
        roles: UserRole[];
        resetPath: string;
        portalLabel: string;
    }): Promise<void>;
    resetPassword(dto: ResetPasswordDto, scope?: {
        roles: UserRole[];
    }): Promise<void>;
    initiateTotpSetup(userId: string): Promise<TotpSetupResult>;
    confirmTotpSetup(userId: string, dto: SetupTotpDto): Promise<string[]>;
    disableTotp(userId: string, dto: DisableTotpDto): Promise<void>;
    createStaffAccount(dto: {
        firstName: string;
        lastName: string;
        email: string;
        role: UserRole;
    }, inviterName: string): Promise<User>;
    private sendVerificationEmail;
    private handleFailedLogin;
    private verifyAndConsumeBackupCode;
    generateTokenPair(user: User, ipAddress?: string, userAgent?: string, family?: string): Promise<TokenPair>;
    deleteAccount(userId: string): Promise<void>;
    hashToken(token: string): string;
}
