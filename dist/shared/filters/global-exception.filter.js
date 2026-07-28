"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var GlobalExceptionFilter_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GlobalExceptionFilter = void 0;
const common_1 = require("@nestjs/common");
const base_entity_1 = require("../entities/base.entity");
let GlobalExceptionFilter = GlobalExceptionFilter_1 = class GlobalExceptionFilter {
    constructor() {
        this.logger = new common_1.Logger(GlobalExceptionFilter_1.name);
    }
    catch(exception, host) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        const request = ctx.getRequest();
        const correlationId = request.headers['x-correlation-id'] ?? (0, base_entity_1.generateUlid)();
        let status;
        let message;
        let error;
        if (exception instanceof common_1.HttpException) {
            status = exception.getStatus();
            const responseBody = exception.getResponse();
            if (typeof responseBody === 'object' && responseBody !== null) {
                const body = responseBody;
                message = body['message'] ?? exception.message;
                error = body['error'] ?? common_1.HttpStatus[status] ?? 'Error';
            }
            else {
                message = exception.message;
                error = common_1.HttpStatus[status] ?? 'Error';
            }
        }
        else if (exception instanceof Error) {
            status = common_1.HttpStatus.INTERNAL_SERVER_ERROR;
            error = 'Internal Server Error';
            message =
                process.env['NODE_ENV'] === 'production'
                    ? 'An unexpected error occurred'
                    : exception.message;
            this.logger.error(`[${correlationId}] Unhandled exception: ${exception.message}`, exception.stack);
        }
        else {
            status = common_1.HttpStatus.INTERNAL_SERVER_ERROR;
            error = 'Internal Server Error';
            message = 'An unexpected error occurred';
            this.logger.error(`[${correlationId}] Unknown exception type:`, exception);
        }
        if (status >= 500) {
            this.logger.error(`[${correlationId}] ${request.method} ${request.url} → ${status}`, exception instanceof Error ? exception.stack : undefined);
        }
        response.status(status).json({
            statusCode: status,
            error,
            message,
            correlationId,
            timestamp: new Date().toISOString(),
            path: request.url,
        });
    }
};
exports.GlobalExceptionFilter = GlobalExceptionFilter;
exports.GlobalExceptionFilter = GlobalExceptionFilter = GlobalExceptionFilter_1 = __decorate([
    (0, common_1.Catch)()
], GlobalExceptionFilter);
//# sourceMappingURL=global-exception.filter.js.map