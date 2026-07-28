export declare class RegisterDto {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    phone?: string;
    countryCode?: string;
}
export declare class LoginDto {
    email: string;
    password: string;
    totpCode?: string;
}
export declare class RefreshTokenDto {
    refreshToken: string;
}
export declare class ForgotPasswordDto {
    email: string;
}
export declare class ResetPasswordDto {
    token: string;
    newPassword: string;
}
export declare class VerifyEmailDto {
    token: string;
}
export declare class ResendVerificationDto {
    email: string;
}
export declare class SetupTotpDto {
    totpCode: string;
}
export declare class DisableTotpDto {
    currentPassword: string;
    totpCode?: string;
}
