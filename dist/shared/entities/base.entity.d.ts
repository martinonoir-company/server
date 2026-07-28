export declare abstract class BaseEntity {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date | null;
    generateId(): void;
}
declare function generateUlid(): string;
export { generateUlid };
