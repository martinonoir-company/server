"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CorrelationInterceptor = void 0;
const common_1 = require("@nestjs/common");
const rxjs_1 = require("rxjs");
const base_entity_1 = require("../entities/base.entity");
let CorrelationInterceptor = class CorrelationInterceptor {
    constructor() {
        this.logger = new common_1.Logger('HTTP');
    }
    intercept(context, next) {
        const request = context.switchToHttp().getRequest();
        const response = context.switchToHttp().getResponse();
        const correlationId = request.headers['x-correlation-id'] ?? (0, base_entity_1.generateUlid)();
        request.headers['x-correlation-id'] = correlationId;
        response.setHeader('X-Correlation-ID', correlationId);
        const startTime = Date.now();
        const { method, url } = request;
        return next.handle().pipe((0, rxjs_1.tap)({
            next: () => {
                const duration = Date.now() - startTime;
                const statusCode = response.statusCode;
                const logMessage = `${method} ${url} ${statusCode} ${duration}ms [${correlationId}]`;
                if (duration > 1000) {
                    this.logger.warn(`SLOW ${logMessage}`);
                }
                else {
                    this.logger.log(logMessage);
                }
            },
            error: (err) => {
                const duration = Date.now() - startTime;
                const { status, detail } = describeError(err);
                this.logger.error(`${method} ${url} ${status} ${duration}ms [${correlationId}] ${detail}`);
            },
        }));
    }
};
exports.CorrelationInterceptor = CorrelationInterceptor;
exports.CorrelationInterceptor = CorrelationInterceptor = __decorate([
    (0, common_1.Injectable)()
], CorrelationInterceptor);
function describeError(err) {
    if (err instanceof common_1.HttpException) {
        const status = err.getStatus();
        const body = err.getResponse();
        if (typeof body === 'string') {
            return { status, detail: `(${err.name}: ${body})` };
        }
        if (body && typeof body === 'object') {
            const b = body;
            const msg = b['message'];
            const errorName = b['error'] ?? err.name;
            const msgStr = Array.isArray(msg)
                ?
                    msg.map((m) => String(m)).join(' | ')
                : msg
                    ? String(msg)
                    : err.message;
            return { status, detail: `(${errorName}: ${msgStr})` };
        }
        return { status, detail: `(${err.name})` };
    }
    if (err instanceof Error) {
        return {
            status: 500,
            detail: `(${err.name}: ${err.message})`,
        };
    }
    return { status: 500, detail: `(Unknown error: ${String(err)})` };
}
//# sourceMappingURL=correlation.interceptor.js.map