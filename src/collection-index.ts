import { COLLECTION_INDEX_TOTAL_CARDS, type ProjectedCollectionCard } from "./cards-collection.js";

export type CollectionIndex = {
  player: string;
  cards: ProjectedCollectionCard[];
  definitionsTraceId: string;
  definitionMissingCount: number | undefined;
  retrievedAt: string;
  endpoint: string;
  traceId: string;
};

/**
 * Per-username projected collection, bounded by a total card budget across all usernames
 * rather than by entry count, because one large account can outweigh many small ones.
 */
export class CollectionIndexCache {
  private readonly entries = new Map<string, { value: CollectionIndex; expiresAt: number }>();

  constructor(private readonly now: () => number, private readonly totalCards = COLLECTION_INDEX_TOTAL_CARDS) {}

  get(username: string, definitionsTraceId: string): CollectionIndex | undefined {
    const entry = this.entries.get(username);
    if (entry === undefined) return undefined;
    if (entry.expiresAt <= this.now() || entry.value.definitionsTraceId !== definitionsTraceId) {
      this.entries.delete(username);
      return undefined;
    }
    this.entries.delete(username);
    this.entries.set(username, entry);
    return entry.value;
  }

  set(username: string, value: CollectionIndex, ttlMs: number): void {
    const now = this.now();
    this.entries.delete(username);
    for (const [key, entry] of this.entries) if (entry.expiresAt <= now) this.entries.delete(key);
    if (value.cards.length > this.totalCards) return;
    let held = [...this.entries.values()].reduce((sum, entry) => sum + entry.value.cards.length, 0);
    for (const [key, entry] of this.entries) {
      if (held + value.cards.length <= this.totalCards) break;
      held -= entry.value.cards.length;
      this.entries.delete(key);
    }
    this.entries.set(username, { value, expiresAt: now + ttlMs });
  }

  heldCards(): number {
    return [...this.entries.values()].reduce((sum, entry) => sum + entry.value.cards.length, 0);
  }
}
