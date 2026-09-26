/** Lowercase and drop punctuation so "merchants coat" finds "Merchant's Coat". */
export function normalize(text: string): string {
  return text.toLowerCase().replace(/['’`".,!?-]/g, ' ').replace(/\s+/g, ' ').trim();
}
