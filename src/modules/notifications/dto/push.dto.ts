import { IsEnum, IsOptional, IsString, Length, MaxLength } from 'class-validator';

/** Body for POST /notifications/push/register. */
export class RegisterPushTokenDto {
  @IsString()
  @Length(1, 200)
  expoPushToken!: string;

  @IsOptional()
  @IsEnum(['ios', 'android'])
  platform?: 'ios' | 'android';

  @IsOptional()
  @IsString()
  @MaxLength(200)
  deviceLabel?: string;
}

/** Body for POST /notifications/push/unregister. */
export class UnregisterPushTokenDto {
  @IsString()
  @Length(1, 200)
  expoPushToken!: string;
}
