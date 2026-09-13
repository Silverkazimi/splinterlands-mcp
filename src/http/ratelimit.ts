export const DEFAULT_RATE_PER_SECOND = 2;
export const DEFAULT_BURST = 4;
export const MAX_RATE_PER_SECOND = 5;

type Bucket = {
  tokens: number;
  updatedAt: number;
  tail: Promise<void>;
};

export type RateLimiterOptions = {
  ratePerSecond?: number;
  burst?: number;
  env?: NodeJS.ProcessEnv;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  onClamp?: (configured: number, applied: number) => void;
};

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function configuredRate(options: RateLimiterOptions): number {
  const raw = options.ratePerSecond ?? Number(options.env?.SPLINTERLANDS_MCP_RATE);
  if (raw === undefined || Number.isNaN(raw) || raw <= 0) {
    return DEFAULT_RATE_PER_SECOND;
  }
  if (raw > MAX_RATE_PER_SECOND) {
    (options.onClamp ?? ((value, applied) => {
      console.error(`SPLINTERLANDS_MCP_RATE ${value} exceeds ${MAX_RATE_PER_SECOND}; using ${applied}.`);
    }))(raw, MAX_RATE_PER_SECOND);
    return MAX_RATE_PER_SECOND;
  }
  return raw;
}

export class HostRateLimiter {
  readonly ratePerSecond: number;
  readonly burst: number;
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly buckets = new Map<string, Bucket>();

  constructor(options: RateLimiterOptions = {}) {
    this.ratePerSecond = configuredRate(options);
    this.burst = options.burst ?? DEFAULT_BURST;
    if (!Number.isInteger(this.burst) || this.burst < 1) {
      throw new RangeError("Burst must be a positive integer");
    }
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? defaultSleep;
  }

  async acquire(host: string): Promise<void> {
    let bucket = this.buckets.get(host);
    if (bucket === undefined) {
      bucket = { tokens: this.burst, updatedAt: this.now(), tail: Promise.resolve() };
      this.buckets.set(host, bucket);
    }

    const previous = bucket.tail;
    let release!: () => void;
    bucket.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      await this.take(bucket);
    } finally {
      release();
    }
  }

  private async take(bucket: Bucket): Promise<void> {
    while (true) {
      const current = this.now();
      const elapsed = Math.max(0, current - bucket.updatedAt);
      bucket.tokens = Math.min(this.burst, bucket.tokens + elapsed * this.ratePerSecond / 1000);
      bucket.updatedAt = current;
      if (bucket.tokens >= 1) {
        bucket.tokens -= 1;
        return;
      }
      const wait = Math.ceil((1 - bucket.tokens) * 1000 / this.ratePerSecond);
      await this.sleep(wait);
    }
  }
}
