import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load env the same way the app does: server/.env first, then ../.env as fallback.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const isTs = __filename.endsWith('.ts');
const ext = isTs ? 'ts' : 'js';
const rootDir = isTs
  ? path.resolve(__dirname, '..')
  : path.resolve(__dirname, '..');

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USER ?? 'martinonoir',
  password: process.env.DB_PASSWORD ?? 'martinonoir_dev',
  database: process.env.DB_NAME ?? 'martinonoir',
  entities: [path.join(rootDir, `modules/**/*.entity.${ext}`)],
  migrations: [path.join(rootDir, `database/migrations/*.${ext}`)],
  migrationsTableName: 'typeorm_migrations',
  logging: process.env.NODE_ENV !== 'production',
  synchronize: false,
});

export default AppDataSource;
