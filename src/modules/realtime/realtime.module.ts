import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PosGateway } from './pos.gateway';

/**
 * Realtime module — owns the Socket.IO gateway for the /pos namespace.
 *
 * Exports PosGateway so PosSessionsModule can inject it and emit events
 * after a REST mutation. AuthModule is imported for JwtService (handshake
 * token verification); ConfigService comes from the global ConfigModule.
 */
@Module({
  imports: [AuthModule],
  providers: [PosGateway],
  exports: [PosGateway],
})
export class RealtimeModule {}
