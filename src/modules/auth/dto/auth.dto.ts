import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  Matches,
  Length,
} from 'class-validator';

export class RegisterDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  countryCode?: string;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;

  @IsOptional()
  @IsString()
  @Length(6, 8)
  totpCode?: string;
}

export class RefreshTokenDto {
  @IsString()
  refreshToken!: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()\-_=+{};:,<.>])/, {
    message: 'Password must contain uppercase, lowercase, number and special character',
  })
  newPassword!: string;
}

export class VerifyEmailDto {
  @IsString()
  token!: string;
}

export class ResendVerificationDto {
  @IsEmail()
  email!: string;
}

export class SetupTotpDto {
  /** TOTP code from authenticator app — used to verify setup before enabling */
  @IsString()
  @Length(6, 6)
  totpCode!: string;
}

export class DisableTotpDto {
  @IsString()
  currentPassword!: string;

  @IsOptional()
  @IsString()
  @Length(6, 6)
  totpCode?: string;
}
