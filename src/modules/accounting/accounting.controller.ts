import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RequirePermissions } from '../../shared/decorators/require-permissions.decorator';
import { Permission } from '../users/entities/role.entity';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { AccountingService } from './accounting.service';
import { ExpenseCategory } from './entities/expense.entity';
import { AccountingAuditAction } from './entities/accounting-audit-log.entity';

// ── DTOs ──

class DateRangeQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

class ListExpensesQueryDto extends DateRangeQueryDto {
  @IsOptional() @IsInt() @Min(1) page?: number;
  @IsOptional() @IsInt() @Min(1) limit?: number;
  @IsOptional() @IsEnum(ExpenseCategory) category?: ExpenseCategory;
  @IsOptional() @IsString() search?: string;
  /** ?includeDeleted=true for the audit reconstruction case. */
  @IsOptional() @IsString() includeDeleted?: string;
}

class CreateExpenseDto {
  @IsString() @MaxLength(200) title!: string;
  @IsEnum(ExpenseCategory) category!: ExpenseCategory;
  /** Minor units (kobo). > 0. */
  @IsInt() @Min(1) amountMinor!: number;
  @IsDateString() incurredAt!: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() vendor?: string;
  @IsOptional() @IsString() referenceNumber?: string;
}

class UpdateExpenseDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsEnum(ExpenseCategory) category?: ExpenseCategory;
  @IsOptional() @IsInt() @Min(1) amountMinor?: number;
  @IsOptional() @IsDateString() incurredAt?: string;
  @IsOptional() @IsString() notes?: string | null;
  @IsOptional() @IsString() vendor?: string | null;
  @IsOptional() @IsString() referenceNumber?: string | null;
}

class ListAuditQueryDto extends DateRangeQueryDto {
  @IsOptional() @IsInt() @Min(1) page?: number;
  @IsOptional() @IsInt() @Min(1) limit?: number;
  @IsOptional() @IsEnum(AccountingAuditAction) action?: AccountingAuditAction;
  @IsOptional() @IsString() entityType?: string;
}

@Controller({ path: 'accounting', version: '1' })
@UseGuards(JwtAuthGuard)
export class AccountingController {
  constructor(private readonly accountingService: AccountingService) {}

  // ── Reporting ──

  @Get('dashboard')
  @RequirePermissions(Permission.ACCOUNTING_VIEW)
  async dashboard(@Query() q: DateRangeQueryDto) {
    return { data: await this.accountingService.dashboard(q.from, q.to) };
  }

  @Get('pnl')
  @RequirePermissions(Permission.ACCOUNTING_VIEW)
  async pnl(@Query() q: DateRangeQueryDto) {
    return { data: await this.accountingService.pnl(q.from, q.to) };
  }

  /** Exporting marks an audit log entry but otherwise returns the same P&L. */
  @Post('pnl/export')
  @HttpCode(200)
  @RequirePermissions(Permission.ACCOUNTING_VIEW)
  async exportPnl(@Query() q: DateRangeQueryDto, @CurrentUser() user: User) {
    const data = await this.accountingService.pnl(q.from, q.to);
    await this.accountingService.logExport(user, {
      kind: 'PNL',
      range: { from: data.range.from, to: data.range.to },
    });
    return { data };
  }

  // ── Expenses ──

  @Get('expenses')
  @RequirePermissions(Permission.ACCOUNTING_VIEW)
  async listExpenses(@Query() q: ListExpensesQueryDto) {
    return {
      data: await this.accountingService.listExpenses({
        page: q.page,
        limit: q.limit,
        from: q.from,
        to: q.to,
        category: q.category,
        search: q.search,
        includeDeleted: q.includeDeleted === 'true',
      }),
    };
  }

  @Post('expenses')
  @RequirePermissions(Permission.ACCOUNTING_MANAGE)
  async createExpense(
    @Body() dto: CreateExpenseDto,
    @CurrentUser() user: User,
  ) {
    return { data: await this.accountingService.createExpense(user, dto) };
  }

  @Put('expenses/:id')
  @RequirePermissions(Permission.ACCOUNTING_MANAGE)
  async updateExpense(
    @Param('id') id: string,
    @Body() dto: UpdateExpenseDto,
    @CurrentUser() user: User,
  ) {
    return {
      data: await this.accountingService.updateExpense(user, id, dto),
    };
  }

  @Delete('expenses/:id')
  @HttpCode(200)
  @RequirePermissions(Permission.ACCOUNTING_MANAGE)
  async deleteExpense(@Param('id') id: string, @CurrentUser() user: User) {
    await this.accountingService.deleteExpense(user, id);
    return { data: { ok: true } };
  }

  @Post('expenses/:id/restore')
  @HttpCode(200)
  @RequirePermissions(Permission.ACCOUNTING_MANAGE)
  async restoreExpense(@Param('id') id: string, @CurrentUser() user: User) {
    return {
      data: await this.accountingService.restoreExpense(user, id),
    };
  }

  // ── Audit log ──

  @Get('audit')
  @RequirePermissions(Permission.ACCOUNTING_VIEW)
  async listAudit(@Query() q: ListAuditQueryDto) {
    return {
      data: await this.accountingService.listAuditLog({
        page: q.page,
        limit: q.limit,
        action: q.action,
        entityType: q.entityType,
        from: q.from,
        to: q.to,
      }),
    };
  }
}
