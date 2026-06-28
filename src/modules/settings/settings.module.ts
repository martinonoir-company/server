import { Module } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';

/**
 * Store settings. Reads/writes the shared `app_settings` key/value table via
 * raw SQL (see SettingsService) — no TypeOrmModule.forFeature needed.
 */
@Module({
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
