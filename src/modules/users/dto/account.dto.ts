import { IsString, IsOptional, IsEmail, MinLength, Matches } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() countryCode?: string;
}

export class ChangePasswordDto {
  @IsString() currentPassword!: string;

  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])/, {
    message: 'New password must contain uppercase, lowercase, number, and special character',
  })
  newPassword!: string;
}
