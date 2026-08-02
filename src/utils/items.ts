/**
 * `Zotero.Items.get()` resolves to `false` for an id that no longer exists —
 * a deleted attachment, an item from a library that has since been removed.
 * `false` does not compose with optional chaining or `??`, so normalize the
 * miss to undefined and let call sites keep using the usual idioms.
 */
export function getItem(itemID: number | string): Zotero.Item | undefined {
  return Zotero.Items.get(itemID) || undefined;
}
