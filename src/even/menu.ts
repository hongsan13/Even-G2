import type { FavoriteRoute } from '../transit/types';
export const MENU_NEXT = 1, MENU_PREVIOUS = 2, MENU_ROUTE_BASE = 100;
export function menuItems(favorites: FavoriteRoute[]): { itemName: string; itemID: number }[] {
  return [{ itemName: '次の列車', itemID: MENU_NEXT }, { itemName: '前の列車', itemID: MENU_PREVIOUS },
    ...favorites.slice(0, 8).map((f, i) => ({ itemName: truncateBytes(f.name, 32), itemID: MENU_ROUTE_BASE + i }))];
}
export function truncateBytes(value: string, max: number): string {
  let out = '';
  for (const character of value) {
    if (new TextEncoder().encode(out + character).length > max) break;
    out += character;
  }
  return out;
}
