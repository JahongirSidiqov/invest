import type { RedisLike } from '../infra/redis';

/** In-memory Redis for unit tests. Time is controlled through `now`. */
export class FakeRedis implements RedisLike {
  now = 0;
  private readonly store = new Map<string, { value: string; expiresAt: number | null }>();

  advance(seconds: number): void {
    this.now += seconds * 1000;
  }

  private live(key: string) {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== null && entry.expiresAt <= this.now) {
      this.store.delete(key);
      return undefined;
    }
    return entry;
  }

  async get(key: string) {
    return this.live(key)?.value ?? null;
  }

  async set(key: string, value: string, _mode: 'EX', seconds: number, flag?: 'NX') {
    if (flag === 'NX' && this.live(key)) return null;
    this.store.set(key, { value, expiresAt: this.now + seconds * 1000 });
    return 'OK' as const;
  }

  async del(...keys: string[]) {
    let removed = 0;
    for (const key of keys) if (this.store.delete(key)) removed++;
    return removed;
  }

  async incr(key: string) {
    const entry = this.live(key);
    const value = Number(entry?.value ?? 0) + 1;
    this.store.set(key, { value: String(value), expiresAt: entry?.expiresAt ?? null });
    return value;
  }

  async expire(key: string, seconds: number) {
    const entry = this.live(key);
    if (!entry) return 0;
    entry.expiresAt = this.now + seconds * 1000;
    return 1;
  }

  async ttl(key: string) {
    const entry = this.live(key);
    if (!entry) return -2;
    if (entry.expiresAt === null) return -1;
    return Math.ceil((entry.expiresAt - this.now) / 1000);
  }

  async quit() {
    return 'OK';
  }
}
