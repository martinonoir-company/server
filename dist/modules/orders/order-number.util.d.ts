import { EntityManager } from 'typeorm';
export declare function nextOrderNumber(manager: EntityManager, prefix: string): Promise<string>;
export declare function withUniqueOrderNumber<T>(manager: EntityManager, prefix: string, build: (orderNumber: string) => Promise<T>, maxAttempts?: number): Promise<T>;
