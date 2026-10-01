import editions from "./data/card-editions.json" with { type: "json" };

export type PrintClass = "main" | "promo" | "reward" | "extra" | "mini_set" | "soulbound" | "outlier";
export type CardSetFields = {
  main_set: string | null;
  main_set_label: string | null;
  print_class: PrintClass | null;
  sub_set: string | null;
  edition_unmapped?: true;
};

const editionByNumber = new Map(editions.numericEditions.map((row) => [row.number, row]));
const setByValue = new Map(editions.cardSetValues.map((row) => [row.value, row]));

export const MAIN_SET_VALUES = editions.cardSetValues.map((row) => row.value);
export const PRINT_CLASS_VALUES: PrintClass[] = ["main", "promo", "reward", "extra", "mini_set", "soulbound", "outlier"];

export function withCardSetHierarchy<T extends { card_set?: unknown; edition?: unknown }>(card: T): T & CardSetFields {
  const mainSet = typeof card.card_set === "string" ? card.card_set : null;
  const edition = typeof card.edition === "number" && Number.isInteger(card.edition)
    ? editionByNumber.get(card.edition) : undefined;
  return {
    ...card,
    main_set: mainSet,
    main_set_label: mainSet === null ? null : setByValue.get(mainSet.toLowerCase())?.label ?? null,
    print_class: (edition?.printClass as PrintClass | undefined) ?? null,
    sub_set: edition?.subSet ?? null,
    ...(!edition ? { edition_unmapped: true as const } : {}),
  };
}
