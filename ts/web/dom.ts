// Small shared helper so every module doesn't repeat `document.getElementById`
// null-narrowing by hand. The original vanilla-JS code never checked for a
// missing element either — if the HTML doesn't have the id, it would throw a
// TypeError the moment `.innerHTML = ...` etc. was called on `null`. `el()`
// preserves that same "fail loudly if the markup doesn't match" behavior,
// just with a clearer error message, which is the point of moving to TS.
export function el<T extends Element = HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`missing #${id}`);
  return e as unknown as T;
}

export function maybeEl<T extends Element = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as unknown as T | null;
}
