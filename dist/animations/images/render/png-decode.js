import { inflateSync } from 'node:zlib';
import { PNG_SIGNATURE } from './png.js';
/** The largest picture that is read, in pixels on a side (Discord sends 64 to 128; anything huge is not an avatar). */
export const MAX_DECODE_SIZE = 1024;
/** Samples per pixel for each colour type: grey, colour, palette, grey + alpha, colour + alpha. */
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};
/** Undoes the row filters of one (sub)image in place. Returns the raw bytes without the filter bytes. */
function unfilter(data, offset, rows, stride, bpp) {
    const out = new Uint8Array(rows * stride);
    let pos = offset;
    for (let y = 0; y < rows; y++) {
        const filter = data[pos++];
        const row = y * stride;
        const prev = row - stride;
        for (let x = 0; x < stride; x++) {
            const raw = data[pos++];
            const left = x >= bpp ? out[row + x - bpp] : 0;
            const up = y > 0 ? out[prev + x] : 0;
            const upLeft = y > 0 && x >= bpp ? out[prev + x - bpp] : 0;
            let value;
            switch (filter) {
                case 0:
                    value = raw;
                    break;
                case 1:
                    value = raw + left;
                    break;
                case 2:
                    value = raw + up;
                    break;
                case 3:
                    value = raw + ((left + up) >> 1);
                    break;
                case 4:
                    value = raw + paeth(left, up, upLeft);
                    break;
                default:
                    return null;
            }
            out[row + x] = value & 255;
        }
    }
    return out;
}
/** The sample `index` (counting samples along the row) of a row that starts at `rowStart`. */
function sample(raw, rowStart, index, depth) {
    if (depth === 8)
        return raw[rowStart + index];
    if (depth === 16)
        return (raw[rowStart + index * 2] << 8) | raw[rowStart + index * 2 + 1];
    const perByte = 8 / depth;
    const byte = raw[rowStart + Math.floor(index / perByte)];
    const shift = 8 - depth * ((index % perByte) + 1);
    return (byte >> shift) & ((1 << depth) - 1);
}
/** The seven passes of Adam7 interlacing: where each starts and how far apart its pixels are. */
const ADAM7 = [
    { x0: 0, y0: 0, dx: 8, dy: 8 },
    { x0: 4, y0: 0, dx: 8, dy: 8 },
    { x0: 0, y0: 4, dx: 4, dy: 8 },
    { x0: 2, y0: 0, dx: 4, dy: 4 },
    { x0: 0, y0: 2, dx: 2, dy: 4 },
    { x0: 1, y0: 0, dx: 2, dy: 2 },
    { x0: 0, y0: 1, dx: 1, dy: 2 },
];
/** Reads a PNG file. Returns null if it isn't a PNG this can read. */
export function decodePng(file) {
    try {
        return decode(file);
    }
    catch {
        return null;
    }
}
function decode(file) {
    if (file.length < 33 || PNG_SIGNATURE.some((b, i) => file[i] !== b))
        return null;
    const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
    let width = 0;
    let height = 0;
    let depth = 0;
    let colorType = -1;
    let interlace = 0;
    let palette = null;
    let paletteAlpha = null;
    let transparentKey = null;
    const parts = [];
    let pos = 8;
    while (pos + 12 <= file.length) {
        const length = view.getUint32(pos);
        const type = String.fromCharCode(file[pos + 4], file[pos + 5], file[pos + 6], file[pos + 7]);
        const start = pos + 8;
        const end = start + length;
        if (end + 4 > file.length)
            return null;
        const body = file.subarray(start, end);
        if (type === 'IHDR') {
            if (length !== 13)
                return null;
            width = view.getUint32(start);
            height = view.getUint32(start + 4);
            depth = body[8];
            colorType = body[9];
            interlace = body[12];
        }
        else if (type === 'PLTE') {
            palette = body;
        }
        else if (type === 'tRNS') {
            if (colorType === 3)
                paletteAlpha = body;
            else if (colorType === 0 && length >= 2)
                transparentKey = [view.getUint16(start)];
            else if (colorType === 2 && length >= 6)
                transparentKey = [view.getUint16(start), view.getUint16(start + 2), view.getUint16(start + 4)];
        }
        else if (type === 'IDAT') {
            parts.push(body);
        }
        else if (type === 'IEND') {
            break;
        }
        pos = end + 4;
    }
    const channels = CHANNELS[colorType];
    if (!channels || width < 1 || height < 1 || width > MAX_DECODE_SIZE || height > MAX_DECODE_SIZE)
        return null;
    if (![1, 2, 4, 8, 16].includes(depth) || (colorType === 3 && depth === 16) || ((colorType === 2 || colorType === 4 || colorType === 6) && depth < 8))
        return null;
    if (colorType === 3 && !palette)
        return null;
    if (interlace !== 0 && interlace !== 1)
        return null;
    if (parts.length === 0)
        return null;
    const bitsPerPixel = channels * depth;
    const bpp = Math.max(1, bitsPerPixel >> 3);
    const packed = Buffer.concat(parts);
    // Every pass together holds at most one filter byte per row plus the pixels: a safe upper bound on what is worth inflating.
    const limit = height * (1 + Math.ceil((width * bitsPerPixel) / 8)) + height * 8 + 64;
    const data = inflateSync(packed, { maxOutputLength: limit * 2 });
    const rgba = new Uint8Array(width * height * 4);
    const max = (1 << depth) - 1;
    const to8 = (v) => (depth === 8 ? v : depth === 16 ? v >> 8 : Math.round((v * 255) / max));
    const put = (raw, rowStart, px, x, y) => {
        const out = (y * width + x) * 4;
        const at = px * channels;
        if (colorType === 3) {
            const index = sample(raw, rowStart, px, depth);
            const p = palette;
            rgba[out] = p[index * 3] ?? 0;
            rgba[out + 1] = p[index * 3 + 1] ?? 0;
            rgba[out + 2] = p[index * 3 + 2] ?? 0;
            rgba[out + 3] = paletteAlpha?.[index] ?? 255;
        }
        else if (colorType === 0 || colorType === 4) {
            const v = sample(raw, rowStart, at, depth);
            const grey = to8(v);
            rgba[out] = rgba[out + 1] = rgba[out + 2] = grey;
            rgba[out + 3] = colorType === 4 ? to8(sample(raw, rowStart, at + 1, depth)) : transparentKey && transparentKey[0] === v ? 0 : 255;
        }
        else {
            const r = sample(raw, rowStart, at, depth);
            const g = sample(raw, rowStart, at + 1, depth);
            const b = sample(raw, rowStart, at + 2, depth);
            rgba[out] = to8(r);
            rgba[out + 1] = to8(g);
            rgba[out + 2] = to8(b);
            rgba[out + 3] =
                colorType === 6 ? to8(sample(raw, rowStart, at + 3, depth)) : transparentKey && transparentKey[0] === r && transparentKey[1] === g && transparentKey[2] === b ? 0 : 255;
        }
    };
    if (interlace === 0) {
        const stride = Math.ceil((width * bitsPerPixel) / 8);
        if (data.length < height * (stride + 1))
            return null;
        const raw = unfilter(data, 0, height, stride, bpp);
        if (!raw)
            return null;
        for (let y = 0; y < height; y++)
            for (let x = 0; x < width; x++)
                put(raw, y * stride, x, x, y);
    }
    else {
        let offset = 0;
        for (const pass of ADAM7) {
            const w = Math.ceil((width - pass.x0) / pass.dx);
            const h = Math.ceil((height - pass.y0) / pass.dy);
            if (w <= 0 || h <= 0)
                continue;
            const stride = Math.ceil((w * bitsPerPixel) / 8);
            if (data.length < offset + h * (stride + 1))
                return null;
            const raw = unfilter(data, offset, h, stride, bpp);
            if (!raw)
                return null;
            offset += h * (stride + 1);
            for (let j = 0; j < h; j++)
                for (let i = 0; i < w; i++)
                    put(raw, j * stride, i, pass.x0 + i * pass.dx, pass.y0 + j * pass.dy);
        }
    }
    return { width, height, rgba };
}
//# sourceMappingURL=png-decode.js.map