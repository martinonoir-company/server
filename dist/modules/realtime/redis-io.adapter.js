"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisIoAdapter = void 0;
const common_1 = require("@nestjs/common");
const platform_socket_io_1 = require("@nestjs/platform-socket.io");
class RedisIoAdapter extends platform_socket_io_1.IoAdapter {
    constructor(app) {
        super(app);
        this.logger = new common_1.Logger(RedisIoAdapter.name);
        this.adapterConstructor = null;
    }
    async connectToRedis() {
        const url = process.env['REDIS_URL'];
        if (!url) {
            this.logger.log('REDIS_URL not set — Socket.IO running with the in-memory adapter (single-node).');
            return;
        }
        try {
            const { createAdapter } = require('@socket.io/redis-adapter');
            const { Redis } = require('ioredis');
            const pubClient = new Redis(url);
            const subClient = pubClient.duplicate();
            pubClient.on('error', (err) => this.logger.error(`Redis pub client error: ${err.message}`));
            subClient.on('error', (err) => this.logger.error(`Redis sub client error: ${err.message}`));
            this.adapterConstructor = createAdapter(pubClient, subClient);
            this.logger.log('Socket.IO Redis adapter connected (multi-node mode).');
        }
        catch (err) {
            this.logger.error(`Failed to initialise Redis adapter — falling back to in-memory. ${err instanceof Error ? err.message : err}`);
            this.adapterConstructor = null;
        }
    }
    createIOServer(port, options) {
        const server = super.createIOServer(port, options);
        if (this.adapterConstructor) {
            server.adapter(this.adapterConstructor);
        }
        return server;
    }
}
exports.RedisIoAdapter = RedisIoAdapter;
//# sourceMappingURL=redis-io.adapter.js.map