import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheService } from './services/cache.service';
import { Role } from '../modules/users/entities/role.entity';

/**
 * SharedModule is @Global — exported providers are available throughout the app
 * without needing to re-import the module.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Role])],
  providers: [CacheService],
  exports: [CacheService, TypeOrmModule],
})
export class SharedModule {}
