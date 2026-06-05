import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantSettings } from './entities/tenant-settings.entity';
import { UserSettings } from './entities/user-settings.entity';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TenantSettings, UserSettings], 'cacheDb')],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
