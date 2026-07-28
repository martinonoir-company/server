import { AnalyticsService, AnalyticsRange } from './analytics.service';
declare class AnalyticsQueryDto {
    range?: AnalyticsRange;
}
export declare class AnalyticsController {
    private readonly analytics;
    constructor(analytics: AnalyticsService);
    summary(query: AnalyticsQueryDto): Promise<{
        data: import("./analytics.service").AnalyticsSummary;
    }>;
}
export {};
