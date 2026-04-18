import { CreateDateColumn, UpdateDateColumn, DeleteDateColumn, PrimaryColumn, BeforeInsert } from 'typeorm';

/**
 * Base entity with ULID primary key, timestamps, and soft-delete.
 * All domain entities extend this.
 */
export abstract class BaseEntity {
  @PrimaryColumn('varchar', { length: 26 })
  id!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt?: Date | null;

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = generateUlid();
    }
  }
}

/**
 * Monotonic ULID generator (Crockford base32, timestamp + random).
 * Uses crypto.getRandomValues for randomness.
 */
function generateUlid(): string {
  const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const ENCODING_LEN = ENCODING.length;
  const TIME_LEN = 10;
  const RANDOM_LEN = 16;

  const now = Date.now();
  let str = '';

  // Encode timestamp (48 bits → 10 chars)
  let t = now;
  for (let i = TIME_LEN - 1; i >= 0; i--) {
    str = ENCODING[t % ENCODING_LEN] + str;
    t = Math.floor(t / ENCODING_LEN);
  }

  // Encode random (80 bits → 16 chars)
  const randomBytes = new Uint8Array(10);
  crypto.getRandomValues(randomBytes);
  for (let i = 0; i < RANDOM_LEN; i++) {
    const byteIndex = Math.floor((i * 5) / 8);
    const bitOffset = (i * 5) % 8;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    let val = (randomBytes[byteIndex]! >> (8 - bitOffset - 5)) & 0x1f;
    if (bitOffset > 3 && byteIndex + 1 < randomBytes.length) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      val |= (randomBytes[byteIndex + 1]! >> (16 - bitOffset - 5)) & 0x1f;
    }
    str += ENCODING[val & 0x1f];
  }

  return str;
}

export { generateUlid };
