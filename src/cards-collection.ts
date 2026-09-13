import type { FreshSuccess } from "./http/errors.js";

export const COLLECTION_PAGE_LIMIT = 100;
export const COLLECTION_HEAP_LIMIT_BYTES = 128 * 1024 * 1024;
export const COLLECTION_RSS_LIMIT_BYTES = 358 * 1024 * 1024;
export const COLLECTION_MEMORY_SAMPLE_CARDS = 256;
export const COLLECTION_TIMEOUT_MS = 90 * 1000;

export type ProjectedCollectionCard = {
  uid: string;
  card_detail_id: number;
  edition: number;
  gold: boolean;
  foil: number;
  level: number;
  xp: number;
  bcx: number;
  collection_power: number;
  card_set: string;
  land_base_pp?: string | null;
  land_dec_stake_needed?: number | null;
  element?: string;
  secondary_element?: string | null;
  land_abilities?: Array<Array<string | number>>;
  land_abilities_status?: "known" | "level_missing";
  stake_start_date?: string | null;
  stake_end_date?: string | null;
  stake_plot?: number | null;
  staking_status?: "staked" | "unstaking" | "unstaked" | "pending" | "unknown";
  staking_observed_at?: string;
  name?: string;
  color?: string;
  sub_type?: string | null;
  secondary_color?: string | null;
};

export type ProjectedCollection = {
  player: string;
  cards: ProjectedCollectionCard[];
  total: number;
  definition_missing_count?: number;
};

export type CollectionPageOptions = {
  cursor?: number;
  limit?: number;
  enrich?: (card: ProjectedCollectionCard) => ProjectedCollectionCard;
  matches?: (card: ProjectedCollectionCard) => boolean;
  maxHeapBytes?: number;
  maxRssBytes?: number;
};

const PROJECTED_FIELDS = new Set<keyof ProjectedCollectionCard>([
  "uid",
  "card_detail_id",
  "edition",
  "gold",
  "foil",
  "level",
  "xp",
  "bcx",
  "collection_power",
  "card_set",
  "land_base_pp",
  "land_dec_stake_needed",
  "stake_start_date", "stake_end_date", "stake_plot",
]);

export class CollectionParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CollectionParseError";
  }
}

class JsonStreamReader {
  private readonly reader: ReadableStreamDefaultReader<Uint8Array>;
  private readonly decoder = new TextDecoder();
  private text = "";
  private offset = 0;
  private finished = false;
  private cancelled = false;

  constructor(body: ReadableStream<Uint8Array>) {
    this.reader = body.getReader();
  }

  async close(): Promise<void> {
    if (!this.finished && !this.cancelled) {
      this.cancelled = true;
      await this.reader.cancel("collection_parse_complete");
    }
    this.reader.releaseLock();
  }

  async peek(): Promise<string | undefined> {
    await this.ensureCharacter();
    return this.offset < this.text.length ? this.text[this.offset] : undefined;
  }

  async consume(expected?: string): Promise<string> {
    const character = await this.peek();
    if (character === undefined) {
      throw new CollectionParseError(`Unexpected end of collection JSON; expected ${expected ?? "a value"}.`);
    }
    if (expected !== undefined && character !== expected) {
      throw new CollectionParseError(`Unexpected collection JSON character '${character}'; expected '${expected}'.`);
    }
    this.offset += 1;
    this.compact();
    return character;
  }

  async whitespace(): Promise<void> {
    while (true) {
      const character = await this.peek();
      if (character === undefined || !/[\s]/u.test(character)) {
        return;
      }
      await this.consume();
    }
  }

  async string(): Promise<string> {
    await this.whitespace();
    let raw = await this.consume('"');
    while (true) {
      const character = await this.consume();
      raw += character;
      if (character === "\\") {
        raw += await this.consume();
        continue;
      }
      if (character === '"') {
        try {
          return JSON.parse(raw) as string;
        } catch {
          throw new CollectionParseError("Collection JSON contained an invalid string.");
        }
      }
    }
  }

  async primitive(): Promise<unknown> {
    await this.whitespace();
    const character = await this.peek();
    if (character === '"') {
      return this.string();
    }
    if (character === "t") return this.literal("true", true);
    if (character === "f") return this.literal("false", false);
    if (character === "n") return this.literal("null", null);
    if (character !== undefined && "-0123456789".includes(character)) {
      const raw = await this.token();
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        throw new CollectionParseError("Collection JSON contained an invalid number.");
      }
      return value;
    }
    throw new CollectionParseError("Collection JSON contained an unsupported value.");
  }

  async skipValue(): Promise<void> {
    await this.whitespace();
    const character = await this.peek();
    if (character === '"') {
      await this.skipString();
      return;
    }
    if (character === "{") {
      await this.consume();
      await this.whitespace();
      if (await this.peek() === "}") {
        await this.consume();
        return;
      }
      while (true) {
        await this.string();
        await this.whitespace();
        await this.consume(":");
        await this.skipValue();
        await this.whitespace();
        const delimiter = await this.consume();
        if (delimiter === "}") return;
        if (delimiter !== ",") throw new CollectionParseError("Collection JSON contained an invalid object delimiter.");
      }
    }
    if (character === "[") {
      await this.consume();
      await this.whitespace();
      if (await this.peek() === "]") {
        await this.consume();
        return;
      }
      while (true) {
        await this.skipValue();
        await this.whitespace();
        const delimiter = await this.consume();
        if (delimiter === "]") return;
        if (delimiter !== ",") throw new CollectionParseError("Collection JSON contained an invalid array delimiter.");
      }
    }
    await this.primitive();
  }

  async finish(): Promise<void> {
    await this.whitespace();
    if (await this.peek() !== undefined) {
      throw new CollectionParseError("Collection JSON contained trailing data.");
    }
  }

  private async ensureCharacter(): Promise<void> {
    while (this.offset >= this.text.length && !this.finished) {
      const result = await this.reader.read();
      if (result.done) {
        this.text = this.text.slice(this.offset) + this.decoder.decode();
        this.offset = 0;
        this.finished = true;
        return;
      }
      const chunk = this.decoder.decode(result.value, { stream: true });
      this.text = this.text.slice(this.offset) + chunk;
      this.offset = 0;
    }
  }

  private compact(): void {
    if (this.offset > 8192 || this.offset * 2 > this.text.length) {
      this.text = this.text.slice(this.offset);
      this.offset = 0;
    }
  }

  private async literal(expected: string, value: unknown): Promise<unknown> {
    for (const character of expected) {
      await this.consume(character);
    }
    return value;
  }

  private async token(): Promise<string> {
    let token = "";
    while (true) {
      const character = await this.peek();
      if (character === undefined || /[\s,\]}]/u.test(character)) {
        return token;
      }
      token += await this.consume();
    }
  }

  private async skipString(): Promise<void> {
    await this.consume('"');
    while (true) {
      const character = await this.consume();
      if (character === "\\") {
        await this.consume();
      } else if (character === '"') {
        return;
      }
    }
  }
}

function assertType(field: string, value: unknown): void {
  const valid = field === "stake_start_date" || field === "stake_end_date"
    ? value === null || (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/u.test(value) && Number.isFinite(Date.parse(value)))
    : field === "land_dec_stake_needed"
    ? value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0)
    : field === "stake_plot"
    ? value === null || (typeof value === "number" && Number.isSafeInteger(value) && value > 0)
    : field === "land_base_pp"
    ? value === null || (typeof value === "string" && /^\d+(?:\.\d+)?$/u.test(value) && Number.isFinite(Number(value)))
    : field === "uid" || field === "card_set"
    ? typeof value === "string"
    : field === "gold"
    ? typeof value === "boolean"
    : typeof value === "number" && Number.isFinite(value);
  if (!valid) {
    throw new CollectionParseError(`Projected collection field '${field}' had an unexpected wire type.`);
  }
}

async function parseCard(reader: JsonStreamReader): Promise<ProjectedCollectionCard> {
  await reader.whitespace();
  await reader.consume("{");
  const card: Partial<ProjectedCollectionCard> = {};
  await reader.whitespace();
  if (await reader.peek() === "}") {
    throw new CollectionParseError("Collection card object was empty.");
  }
  while (true) {
    const field = await reader.string();
    await reader.whitespace();
    await reader.consume(":");
    if (PROJECTED_FIELDS.has(field as keyof ProjectedCollectionCard)) {
      const value = await reader.primitive();
      assertType(field, value);
      card[field as keyof ProjectedCollectionCard] = value as never;
    } else {
      await reader.skipValue();
    }
    await reader.whitespace();
    const delimiter = await reader.consume();
    if (delimiter === "}") break;
    if (delimiter !== ",") throw new CollectionParseError("Collection card object had an invalid delimiter.");
  }
  for (const field of PROJECTED_FIELDS) {
    if (!["land_base_pp", "land_dec_stake_needed", "stake_start_date", "stake_end_date", "stake_plot"].includes(field) && !(field in card)) {
      throw new CollectionParseError(`Collection card omitted projected field '${field}'.`);
    }
  }
  return card as ProjectedCollectionCard;
}

function enforceMemoryLimits(maxHeapBytes: number, maxRssBytes: number): void {
  const exposedGc = (globalThis as typeof globalThis & { gc?: () => void }).gc;
  if (typeof exposedGc === "function") {
    // Production normally lacks --expose-gc; use an exposed collector only to reduce transient garbage before this diagnostic sample.
    exposedGc();
  }
  const memory = process.memoryUsage();
  if (memory.heapUsed > maxHeapBytes) {
    throw new CollectionParseError(`Collection parsing exceeded the ${maxHeapBytes} byte heap occupancy guard.`);
  }
  if (memory.rss > maxRssBytes) {
    throw new CollectionParseError(`Collection parsing exceeded the ${maxRssBytes} byte RSS operational ceiling.`);
  }
}

export async function parseCardsCollection(
  response: Response,
  pageOptions: CollectionPageOptions = {},
): Promise<ProjectedCollection> {
  if (response.body === null) {
    throw new CollectionParseError("Collection response did not provide a streaming body.");
  }
  const maxHeapBytes = pageOptions.maxHeapBytes ?? COLLECTION_HEAP_LIMIT_BYTES;
  const maxRssBytes = pageOptions.maxRssBytes ?? COLLECTION_RSS_LIMIT_BYTES;
  const cursor = pageOptions.cursor ?? 0;
  const limit = pageOptions.limit ?? COLLECTION_PAGE_LIMIT;
  if (!Number.isInteger(cursor) || cursor < 0) {
    throw new RangeError("Collection cursor must be a non-negative integer");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > COLLECTION_PAGE_LIMIT) {
    throw new RangeError(`Collection limit must be an integer between 1 and ${COLLECTION_PAGE_LIMIT}`);
  }
  const reader = new JsonStreamReader(response.body);
  let player: string | undefined;
  let cards: ProjectedCollectionCard[] | undefined;
  let total = 0;
  let parsedCards = 0;
  let missingDefinitions = 0;
  try {
    await reader.whitespace();
    await reader.consume("{");
    await reader.whitespace();
    if (await reader.peek() === "}") throw new CollectionParseError("Collection response was empty.");
    while (true) {
      const field = await reader.string();
      await reader.whitespace();
      await reader.consume(":");
      if (field === "player") {
        const value = await reader.primitive();
        if (typeof value !== "string") throw new CollectionParseError("Collection response player was not a string.");
        player = value;
      } else if (field === "cards") {
        await reader.whitespace();
        await reader.consume("[");
        cards = [];
        await reader.whitespace();
        if (await reader.peek() !== "]") {
          while (true) {
            const parsed = await parseCard(reader);
            const card = pageOptions.enrich ? pageOptions.enrich(parsed) : parsed;
            if (pageOptions.enrich && card.name === undefined) missingDefinitions += 1;
            parsedCards += 1;
            if (pageOptions.matches?.(card) ?? true) {
              if (total >= cursor && cards.length < limit) {
                cards.push(card);
              }
              total += 1;
            }
            if (parsedCards % COLLECTION_MEMORY_SAMPLE_CARDS === 0) {
              enforceMemoryLimits(maxHeapBytes, maxRssBytes);
            }
            await reader.whitespace();
            const delimiter = await reader.consume();
            if (delimiter === "]") break;
            if (delimiter !== ",") throw new CollectionParseError("Collection cards array had an invalid delimiter.");
          }
          if (parsedCards % COLLECTION_MEMORY_SAMPLE_CARDS !== 0) {
            enforceMemoryLimits(maxHeapBytes, maxRssBytes);
          }
        } else {
          await reader.consume();
        }
      } else {
        await reader.skipValue();
      }
      await reader.whitespace();
      const delimiter = await reader.consume();
      if (delimiter === "}") break;
      if (delimiter !== ",") throw new CollectionParseError("Collection response had an invalid envelope delimiter.");
    }
    await reader.finish();
    if (player === undefined || cards === undefined) {
      throw new CollectionParseError("Collection response did not contain both player and cards.");
    }
    return { player, cards, total, ...(pageOptions.enrich ? { definition_missing_count: missingDefinitions } : {}) };
  } finally {
    await reader.close();
  }
}

export type CollectionSuccess = FreshSuccess<ProjectedCollection>;
