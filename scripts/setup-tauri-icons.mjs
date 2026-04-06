#!/usr/bin/env node
/**
 * Generates placeholder app icons for Tauri in src-tauri/icons/.
 * Run once during initial setup: node scripts/setup-tauri-icons.mjs
 *
 * For production icons, replace with real artwork via:
 *   pnpm tauri icon src-tauri/assets/app-icon.png
 */

import { writeFileSync, mkdirSync } from "fs";
import { deflateSync } from "zlib";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = resolve(__dirname, "../src-tauri/icons");
mkdirSync(iconsDir, { recursive: true });

// Brand color: indigo-500
const R = 99, G = 102, B = 241;

// ─── PNG helpers ──────────────────────────────────────────────────────────────

function uint32BE(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
}

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const crcInput = Buffer.concat([typeBytes, data]);
  return Buffer.concat([uint32BE(data.length), typeBytes, data, uint32BE(crc32(crcInput))]);
}

function createPNG(width, height, r, g, b) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA (required by Tauri)

  const rowSize = 1 + width * 4; // 4 bytes per pixel: R G B A
  const raw = Buffer.alloc(height * rowSize);
  for (let y = 0; y < height; y++) {
    const off = y * rowSize;
    raw[off] = 0; // filter: None
    for (let x = 0; x < width; x++) {
      const p = off + 1 + x * 4;
      raw[p] = r;
      raw[p + 1] = g;
      raw[p + 2] = b;
      raw[p + 3] = 255; // alpha: fully opaque
    }
  }

  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ─── ICO (PNG-embedded, modern format) ────────────────────────────────────────

function createICO(pngData) {
  // ICONDIR
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: ICO
  header.writeUInt16LE(1, 4); // count: 1

  // ICONDIRENTRY
  const entry = Buffer.alloc(16);
  entry[0] = 0; // width (0 = 256)
  entry[1] = 0; // height (0 = 256)
  entry[2] = 0; // colorCount
  entry[3] = 0; // reserved
  entry.writeUInt16LE(1, 4);  // planes
  entry.writeUInt16LE(32, 6); // bitCount
  entry.writeUInt32LE(pngData.length, 8);
  entry.writeUInt32LE(22, 12); // offset: 6 + 16

  return Buffer.concat([header, entry, pngData]);
}

// ─── ICNS (PNG-embedded, macOS) ───────────────────────────────────────────────

function createICNS(pngData) {
  // ic07 = 128x128 PNG
  const osType = Buffer.from("ic07", "ascii");
  const chunkLen = Buffer.alloc(4);
  chunkLen.writeUInt32BE(8 + pngData.length); // type(4) + len(4) + data

  const chunk = Buffer.concat([osType, chunkLen, pngData]);

  const magic = Buffer.from("icns", "ascii");
  const totalLen = Buffer.alloc(4);
  totalLen.writeUInt32BE(8 + chunk.length);

  return Buffer.concat([magic, totalLen, chunk]);
}

// ─── Generate files ───────────────────────────────────────────────────────────

const png32 = createPNG(32, 32, R, G, B);
const png128 = createPNG(128, 128, R, G, B);
const png256 = createPNG(256, 256, R, G, B); // 128x128@2x

writeFileSync(resolve(iconsDir, "32x32.png"), png32);
writeFileSync(resolve(iconsDir, "128x128.png"), png128);
writeFileSync(resolve(iconsDir, "128x128@2x.png"), png256);
writeFileSync(resolve(iconsDir, "icon.ico"), createICO(png256));
writeFileSync(resolve(iconsDir, "icon.icns"), createICNS(png128));

console.log("✓ Placeholder icons written to src-tauri/icons/");
console.log("  For production, replace with: pnpm tauri icon <your-1024x1024.png>");
