// Generates electron/icon.png (256x256 RGBA) and electron/icon.ico with no
// external dependencies. Blue rounded square, white "D", orange accent dot.
const zlib = require("node:zlib");
const fs = require("node:fs");
const path = require("node:path");

const S = 256;
const buf = Buffer.alloc(S * S * 4); // RGBA

function set(x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= S || y >= S) return;
  const i = (y * S + x) * 4;
  // alpha-over composite
  const sa = a / 255, da = buf[i + 3] / 255;
  const oa = sa + da * (1 - sa);
  if (oa === 0) return;
  buf[i] = Math.round((r * sa + buf[i] * da * (1 - sa)) / oa);
  buf[i + 1] = Math.round((g * sa + buf[i + 1] * da * (1 - sa)) / oa);
  buf[i + 2] = Math.round((b * sa + buf[i + 2] * da * (1 - sa)) / oa);
  buf[i + 3] = Math.round(oa * 255);
}

function inRoundedRect(x, y, pad, radius) {
  const min = pad, max = S - pad;
  if (x < min || x > max || y < min || y > max) return false;
  const cx = Math.min(Math.max(x, min + radius), max - radius);
  const cy = Math.min(Math.max(y, min + radius), max - radius);
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

// 1) blue rounded square
for (let y = 0; y < S; y++)
  for (let x = 0; x < S; x++)
    if (inRoundedRect(x, y, 10, 52)) set(x, y, 0x25, 0x63, 0xeb, 255);

// 2) white block "D"
function inD(x, y) {
  const stem = x >= 74 && x <= 108 && y >= 72 && y <= 188;
  const cx = 104, cy = 130, RX = 78, RY = 60, rx = 44, ry = 30;
  const outer = ((x - cx) / RX) ** 2 + ((y - cy) / RY) ** 2 <= 1;
  const inner = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  const bowl = x >= 100 && outer && !inner;
  return stem || bowl;
}
for (let y = 0; y < S; y++)
  for (let x = 0; x < S; x++)
    if (inD(x, y)) set(x, y, 255, 255, 255, 255);

// 3) orange accent dot
for (let y = 0; y < S; y++)
  for (let x = 0; x < S; x++)
    if ((x - 196) ** 2 + (y - 196) ** 2 <= 30 ** 2) set(x, y, 0xf9, 0x73, 0x16, 255);

// ---- PNG encode ----
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0, 0);
  return Buffer.concat([len, body, crc]);
}
function crc32(b) {
  if (zlib.crc32) return zlib.crc32(b);
  let c, table = crc32._t || (crc32._t = (() => { const t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })());
  let crc = 0xffffffff;
  for (let i = 0; i < b.length; i++) crc = table[(crc ^ b[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function pngEncode() {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(S * (S * 4 + 1));
  for (let y = 0; y < S; y++) {
    raw[y * (S * 4 + 1)] = 0; // filter none
    buf.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

const png = pngEncode();
fs.writeFileSync(path.join(__dirname, "icon.png"), png);

// ---- ICO wrapping the PNG (Vista+ PNG-in-ICO) ----
const ico = Buffer.alloc(6 + 16);
ico.writeUInt16LE(0, 0); ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4); // reserved, type=icon, count=1
ico.writeUInt8(0, 6); ico.writeUInt8(0, 7); // 0 => 256px
ico.writeUInt8(0, 8); ico.writeUInt8(0, 9);
ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12);
ico.writeUInt32LE(png.length, 14);
ico.writeUInt32LE(6 + 16, 18);
fs.writeFileSync(path.join(__dirname, "icon.ico"), Buffer.concat([ico, png]));

console.log(`icon.png (${png.length}b) and icon.ico written`);
