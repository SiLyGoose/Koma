/*
 * A tiny 5x7 bitmap font for the pictures the bot draws (the wheel's labels, the die's number):
 * just the digits, ".", and "x".
 */

// A 5x7 bitmap font: just what the labels need.
export const GLYPHS: Record<string, readonly string[]> = {
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['.###.', '#...#', '....#', '..##.', '....#', '#...#', '.###.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  '.': ['..', '..', '..', '..', '..', '##', '##'],
  x: ['.....', '.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
};
export const GLYPH_HEIGHT = 7;

/** Width of a piece of text in font dots (one dot of space between letters). */
export function textWidth(text: string): number {
  let width = 0;
  for (const ch of text) width += (GLYPHS[ch]?.[0]?.length ?? 0) + 1;
  return width - 1;
}

/** Turns on the mask pixels of `text`, centered on (cx, cy), each font dot being `scale` pixels square. */
export function drawText(mask: Uint8Array, size: number, text: string, cx: number, cy: number, scale: number): void {
  let x = Math.round(cx - (textWidth(text) * scale) / 2);
  const top = Math.round(cy - (GLYPH_HEIGHT * scale) / 2);
  for (const ch of text) {
    const glyph = GLYPHS[ch];
    if (!glyph) continue;
    for (let row = 0; row < GLYPH_HEIGHT; row++) {
      const line = glyph[row] as string;
      for (let col = 0; col < line.length; col++) {
        if (line[col] !== '#') continue;
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const px = x + col * scale + dx;
            const py = top + row * scale + dy;
            if (px >= 0 && px < size && py >= 0 && py < size) mask[py * size + px] = 1;
          }
        }
      }
    }
    x += (line0Width(glyph) + 1) * scale;
  }
}

const line0Width = (glyph: readonly string[]): number => (glyph[0] as string).length;

