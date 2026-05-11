import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';

/**
 * Socket.IO adapter that activates the Redis adapter ONLY when REDIS_URL
 * is set, so multiple server replicas can coordinate room broadcasts.
 *
 *  - REDIS_URL unset (dev, single-node prod): the default in-memory
 *    adapter is used — no Redis required, identical behaviour.
 *  - REDIS_URL set (multi-node prod): @socket.io/redis-adapter is wired
 *    up with ioredis pub/sub clients.
 *
 * This is ~zero cost until you actually run >1 app process; flipping the
 * env var is the entire migration path.
 *
 * Usage (in main.ts):
 *   const adapter = new RedisIoAdapter(app);
 *   await adapter.connectToRedis();   // no-op when REDIS_URL is unset
 *   app.useWebSocketAdapter(adapter);
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  // Loaded lazily so the redis-adapter / ioredis modules are only
  // required when actually needed.
  private adapterConstructor: ((nsp: unknown) => unknown) | null = null;

  constructor(app: INestApplicationContext) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const url = process.env['REDIS_URL'];
    if (!url) {
      this.logger.log(
        'REDIS_URL not set — Socket.IO running with the in-memory adapter (single-node).',
      );
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { createAdapter } = require('@socket.io/redis-adapter');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Redis } = require('ioredis');

      const pubClient = new Redis(url);
      const subClient = pubClient.duplicate();

      // Surface connection problems but don't crash the app — a Redis
      // blip should degrade to "events don't fan out cross-node", not
      // take the API down.
      pubClient.on('error', (err: Error) =>
        this.logger.error(`Redis pub client error: ${err.message}`),
      );
      subClient.on('error', (err: Error) =>
        this.logger.error(`Redis sub client error: ${err.message}`),
      );

      this.adapterConstructor = createAdapter(pubClient, subClient);
      this.logger.log('Socket.IO Redis adapter connected (multi-node mode).');
    } catch (err) {
      this.logger.error(
        `Failed to initialise Redis adapter — falling back to in-memory. ${err instanceof Error ? err.message : err}`,
      );
      this.adapterConstructor = null;
    }
  }

  createIOServer(port: number, options?: ServerOptions): unknown {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) {
      // socket.io's server.adapter() accepts the constructor returned by
      // createAdapter().
      (server as { adapter: (c: unknown) => void }).adapter(
        this.adapterConstructor,
      );
    }
    return server;
  }
}
