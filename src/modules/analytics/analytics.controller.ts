import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional } from 'class-validator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RequirePermissions } from '../../shared/decorators/require-permissions.decorator';
import { Permission } from '../users/entities/role.entity';
import { AnalyticsService, AnalyticsRange } from './analytics.service';

class AnalyticsQueryDto {
  @IsOptional()
  @IsIn(['7d', '30d', '90d', '12m'])
  range?: AnalyticsRange;
}

@Controller({ path: 'analytics', version: '1' })
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  /**
   * Single round-trip summary for the admin analytics page.
   *
   * All aggregation runs in Postgres (GROUP BY on `date_trunc`), so the API
   * returns a small JSON payload regardless of how many orders exist.
   */
  @Get('summary')
  @RequirePermissions(Permission.ANALYTICS_VIEW)
  async summary(@Query() query: AnalyticsQueryDto) {
    const data = await this.analytics.getSummary(query.range ?? '30d');
    return { data };
  }
}
