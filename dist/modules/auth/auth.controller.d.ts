import { AuthService, TokenPair, TotpSetupResult } from './auth.service';
import { RegisterDto, LoginDto, RefreshTokenDto, ForgotPasswordDto, ResetPasswordDto, VerifyEmailDto, ResendVerificationDto, SetupTotpDto, DisableTotpDto } from './dto/auth.dto';
import { User } from '../users/entities/user.entity';
import { Request } from 'express';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    register(dto: RegisterDto): Promise<{
        data: TokenPair;
    }>;
    login(dto: LoginDto, req: Request): Promise<{
        data: TokenPair;
    }>;
    refresh(dto: RefreshTokenDto, req: Request): Promise<{
        data: TokenPair;
    }>;
    logout(dto: RefreshTokenDto): Promise<void>;
    logoutAll(user: User): Promise<void>;
    deleteAccount(user: User): Promise<void>;
    forgotPassword(dto: ForgotPasswordDto): Promise<{
        message: string;
    }>;
    resetPassword(dto: ResetPasswordDto): Promise<{
        message: string;
    }>;
    verifyEmail(dto: VerifyEmailDto): Promise<{
        message: string;
    }>;
    resendVerification(dto: ResendVerificationDto): Promise<{
        message: string;
    }>;
    setupTotp(user: User): Promise<{
        data: TotpSetupResult;
    }>;
    confirmTotp(user: User, dto: SetupTotpDto): Promise<{
        data: {
            backupCodes: string[];
        };
    }>;
    disableTotp(user: User, dto: DisableTotpDto): Promise<void>;
    getTotpStatus(user: User): Promise<{
        data: {
            enabled: boolean;
            emailVerified: boolean;
        };
    }>;
}
