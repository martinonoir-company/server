import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailService } from './email.service';
import { PushService } from './push.service';
import { PushController } from './push.controller';
import { PushToken } from './entities/push-token.entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([PushToken])],
  controllers: [PushController],
  providers: [EmailService, PushService],
  exports: [EmailService, PushService],
})
export class NotificationsModule {}
