export const SETTINGS_TTL_MS = 60 * 60 * 1000;
export const CARD_DETAILS_TTL_MS = 24 * 60 * 60 * 1000;
export const COLLECTION_CACHE_TTL_MS = 60 * 1000;
export const PRICES_TTL_MS = 5 * 60 * 1000;
export const AUTH_TIER_TTL_MS = 15 * 60 * 1000;

type Entry<Value> = {
  value: Value;
  expiresAt: number;
};

export class TtlCache<Value> {
  private readonly entries = new Map<string, Entry<Value>>();

  constructor(private readonly now: () => number = Date.now, private readonly maxEntries = 128) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1) throw new RangeError("Cache capacity must be a positive integer");
  }

  get(key: string): Value | undefined {
    const entry = this.entries.get(key);
    if (entry === undefined) {
      return undefined;
    }
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: Value, ttlMs: number): void {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new RangeError("TTL must be a positive finite number");
    }
    const now = this.now();
    for (const [existingKey, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(existingKey);
    }
    this.entries.delete(key);
    while (this.entries.size >= this.maxEntries) this.entries.delete(this.entries.keys().next().value!);
    this.entries.set(key, { value, expiresAt: now + ttlMs });
  }

  ttl(key: string): number | undefined {
    const entry = this.entries.get(key);
    if (entry === undefined) {
      return undefined;
    }
    const remaining = entry.expiresAt - this.now();
    if (remaining <= 0) {
      this.entries.delete(key);
      return undefined;
    }
    return remaining;
  }
}
