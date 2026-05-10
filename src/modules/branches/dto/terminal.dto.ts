import { IsBoolean, IsOptional, IsString, Length, Matches } from 'class-validator';

/**
 * Body for POST /branches/:id/terminals.
 *
 * `code` is globally unique across all branches and IMMUTABLE after creation
 * (historical sales reference it).
 */
export class CreateTerminalDto {
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9-]{0,49}$/, {
    message: 'code must be uppercase alphanumeric with optional dashes (max 50 chars)',
  })
  code!: string;

  @IsString()
  @Length(1, 200)
  name!: string;
}

/**
 * Body for PATCH /branches/:id/terminals/:terminalId.
 * `code` is intentionally absent — immutable.
 */
export class UpdateTerminalDto {
  @IsOptional() @IsString() @Length(1, 200) name?: string;

  @IsOptional() @IsBoolean() isActive?: boolean;
}
