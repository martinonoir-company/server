import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';
import { Expense } from './entities/expense.entity';
import { AccountingAuditLog } from './entities/accounting-audit-log.entity';
import { Order } from '../orders/entities/order.entity';
import { RefundRequest } from '../refunds/entities/refund-request.entity';
import { AgentAttribution } from '../agents/entities/agent-attribution.entity';
import { AgentPayout } from '../agents/entities/agent-payout.entity';
import { MarketingAgent } from '../agents/entities/marketing-agent.entity';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Expense,
      AccountingAuditLog,
      Order,
      RefundRequest,
      AgentAttribution,
      AgentPayout,
      MarketingAgent,
      User,
    ]),
  ],
  controllers: [AccountingController],
  providers: [AccountingService],
  exports: [AccountingService],
})
export class AccountingModule {}
