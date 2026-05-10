import { IsString, Length } from 'class-validator';

/**
 * Body for POST /branches/:id/staff.
 *
 * `userId` is a ULID (varchar(26)) referencing the users table.
 */
export class AssignStaffDto {
  @IsString()
  @Length(26, 26, { message: 'userId must be a 26-char ULID' })
  userId!: string;
}
