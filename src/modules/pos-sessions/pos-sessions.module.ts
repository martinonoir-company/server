import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PosSessionsController } from './pos-sessions.controller';
import { PosSessionsService } from './pos-sessions.service';
import { PosSession } from './entities/pos-session.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Terminal } from '../branches/entities/terminal.entity';
import { UserBranch } from '../branches/entities/user-branch.entity';
import { Product, ProductVariant, ProductMedia } from '../products/entities/product.entity';
import { StockLevel } from '../inventory/entities/inventory.entity';
import { PosModule } from '../pos/pos.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PosSession,
      Terminal,
      Branch,
      UserBranch,
      ProductVariant,
      Product,
      ProductMedia,
      StockLevel,
    ]),
    PosModule, // for PosSyncService (confirm calls into the existing pipeline)
    RealtimeModule, // for PosGateway (emit events after a mutation)
  ],
  controllers: [PosSessionsController],
  providers: [PosSessionsService],
  exports: [PosSessionsService],
})
export class PosSessionsModule {}
