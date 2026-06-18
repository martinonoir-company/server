import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';
import { MarketingAgent } from './entities/marketing-agent.entity';
import { AgentAttribution } from './entities/agent-attribution.entity';
import { AgentPayout } from './entities/agent-payout.entity';
import { User } from '../users/entities/user.entity';
import { Order } from '../orders/entities/order.entity';
import { PaymentsModule } from '../payments/payments.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MarketingAgent,
      AgentAttribution,
      AgentPayout,
      User,
      Order,
    ]),
    // PaymentsModule exposes PaystackProvider; AuthModule exposes
    // AuthService.generateTokenPair used by the agent login endpoint.
    // forwardRef on PaymentsModule because PaymentsController will need
    // to forward payout webhook events back into AgentsService.
    forwardRef(() => PaymentsModule),
    AuthModule,
  ],
  controllers: [AgentsController],
  providers: [AgentsService],
  exports: [AgentsService],
})
export class AgentsModule {}
