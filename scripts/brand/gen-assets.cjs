#!/usr/bin/env node
/**
 * FU-75 round-A · deterministic brand-asset generation.
 *
 * Reproducible, no generative redraw / no vectorization: every output is a pure
 * pixel transform (scale, or coverage-to-alpha matte) of a source-of-record file.
 *
 * Sources of record (NEVER overwritten; kept as the signed-off originals):
 *   MONO (white/green content on PURE BLACK, from the accepted Claude Design showcase):
 *     src/mono/mark2.black.png   (white mark on #000)
 *     src/mono/crest2.black.png  (white line crest on #000)
 *     src/mono/green2.black.png  (green mark on #000)  -- kept for record; not shipped (tab uses white mask + currentColor)
 *   COLOR (transparent/full-bleed painterly masters):
 *     src/color/tile.png    (rounded, transparent corners)
 *     src/color/square.png  (full-bleed opaque square)
 *     src/color/flat.png    (flat simplified, transparent corners -> favicon)
 *
 * Derived assets are all labelled `derived-*` and recorded in manifest.json with
 * {source, sourceSha256, output, outputSha256, transform, dims}. A derived mask is
 * NOT a lossless inversion of a hypothetical transparent master — it is a transparent
 * MASK derived from the black-backed signed-off graphic. The alpha channel is the
 * ARITHMETIC MEAN of the sRGB-encoded R,G,B channels (i.e. (r+g+b)/3 on gamma-encoded
 * values) used as a coverage proxy — this is NOT CIE relative luminance (0.2126R+
 * 0.7152G+0.0722B on linearised values). RGB is forced pure white, colour fringe
 * discarded. Judged clean because the black backing is pure #000 and, at the chroma>20
 * (max-min of sRGB channels) threshold, 0% of edge pixels are coloured (max observed
 * chroma = 11). Formally, recovering a hypothetical original transparent master from a
 * black composite is under-determined; these are DERIVED masks, not reconstructions.
 *
 * Run:  node gen-brand-assets.cjs <SRC_DIR> <OUT_DIR>   (requires `sharp` as a project dependency)
 */
const sharp = require('sharp');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SRC = process.argv[2];
const OUT = process.argv[3];
if (!SRC || !OUT) { console.error('usage: node gen-brand-assets.cjs <SRC_DIR> <OUT_DIR>'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
function assert(cond, msg) { if (!cond) throw new Error('ASSERT FAILED: ' + msg); }

// Frozen signed-off source SHAs. Generation REFUSES to run on any input that does
// not match — a mismatch (or an unregistered source) throws, so the pipeline can
// never silently hash an arbitrary input into a new manifest.
const EXPECTED_SOURCE_SHA = {
  'mono/mark2.black.png':  '42b5b0cb8ab61a007aa2e44c98d95f8b47f382bedcb078b169a572e815592a55',
  'mono/crest2.black.png': 'df0d97784eb49207ea6af6b0687ed6a93f4fc385d2e0317b61cc8b1bcbd9f2da',
  'mono/green2.black.png': 'd6033314749455b5a59c56e37b8f0bbd7a8697ef999549ae58062002163bace7',
  'color/tile.png':        'd8104680ac2da21af949ddf95b0a7029cd9ed7a160a5af01331fe94d454d267c',
  'color/square.png':      '310de3014365d8543bd806d60697bcd8247cde21c0985a2af634bcd482442ae7',
  'color/flat.png':        '6b2c8af99bdac4e460a0faf959c8cd5c0e73787f615b361935bc175f0f33b071',
};

const manifest = [];
function record(entry, buf) {
  fs.writeFileSync(path.join(OUT, entry.output), buf);
  manifest.push({ ...entry, outputSha256: sha(buf), bytes: buf.length });
}
// hash a source AND verify it against the frozen signed-off SHA (fail on mismatch / unregistered)
function srcSha(p) {
  const rel = path.relative(SRC, p).split(path.sep).join('/');
  const h = sha(fs.readFileSync(p));
  const want = EXPECTED_SOURCE_SHA[rel];
  assert(want, `unregistered source "${rel}" — every source must be a frozen signed-off input`);
  assert(h === want, `source SHA mismatch for "${rel}": got ${h}, expected ${want} — refusing to generate from unverified input`);
  return h;
}

// --- meanSrgbCoverage-to-alpha matte of content-on-pure-black -> transparent white MASK ---
async function deriveWhiteMask(srcPath, outName) {
  const { data, info } = await sharp(srcPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, o = Buffer.alloc(W * H * 4);
  for (let p = 0; p < W * H; p++) {
    const r = data[p * 4], g = data[p * 4 + 1], b = data[p * 4 + 2];
    const meanSrgbCoverage = Math.round((r + g + b) / 3); // mean of sRGB-encoded channels; coverage proxy, NOT CIE luminance
    o[p * 4] = 255; o[p * 4 + 1] = 255; o[p * 4 + 2] = 255;
    o[p * 4 + 3] = meanSrgbCoverage < 0 ? 0 : meanSrgbCoverage > 255 ? 255 : meanSrgbCoverage;
  }
  const buf = await sharp(o, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
  const meta = await sharp(buf).metadata();
  assert(meta.hasAlpha && meta.channels === 4, `mask ${outName} must carry an alpha channel`);
  record({ output: outName, source: path.relative(SRC, srcPath), sourceSha256: srcSha(srcPath),
    transform: 'alpha=meanSrgbCoverage=(r+g+b)/3 of content-on-black (coverage proxy, NOT CIE luminance); rgb:=white; discard colour fringe', dims: `${W}x${H}` }, buf);
}

// --- pure resize. opaque=true for maskable/apple-touch (from opaque square, output MUST be opaque);
//     opaque=false preserves alpha for the rounded/transparent tile & flat sources ---
async function resizeAsset(srcPath, size, outName, { opaque = false } = {}) {
  const buf = await sharp(srcPath).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const meta = await sharp(buf).metadata();
  assert(meta.width === size && meta.height === size, `${outName} dims ${meta.width}x${meta.height} != ${size}x${size}`);
  if (opaque) {
    const st = await sharp(buf).stats();
    assert(st.isOpaque, `${outName} must be isOpaque=true (maskable/apple-touch resized from opaque square)`);
  }
  record({ output: outName, source: path.relative(SRC, srcPath), sourceSha256: srcSha(srcPath),
    transform: `resize contain ${size}x${size} ${opaque ? 'from opaque square (isOpaque=true asserted)' : '+ preserve alpha'}`, dims: `${size}x${size}` }, buf);
  return buf;
}

// NOTE: the OG image is NOT generated here. The shipped social card is the signed-off
// gen-tool terminal (src/app/opengraph-image.jpg, see contract §6) — copied in as-is,
// not mechanically composed. No derived OG is produced or shipped.

// --- minimal ICO packer (embeds PNG blobs; supported since Windows Vista / all modern browsers) ---
function packIco(pngs /* [{size, buf}] */) {
  const count = pngs.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(count, 4);
  const dir = Buffer.alloc(16 * count);
  let offset = 6 + 16 * count;
  const blobs = [];
  pngs.forEach((p, i) => {
    const e = dir.subarray(i * 16, i * 16 + 16);
    e.writeUInt8(p.size >= 256 ? 0 : p.size, 0);
    e.writeUInt8(p.size >= 256 ? 0 : p.size, 1);
    e.writeUInt8(0, 2); e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(p.buf.length, 8); e.writeUInt32LE(offset, 12);
    offset += p.buf.length; blobs.push(p.buf);
  });
  return Buffer.concat([header, dir, ...blobs]);
}

(async () => {
  const monoDir = path.join(SRC, 'mono'), colorDir = path.join(SRC, 'color');

  // precondition: the maskable/apple-touch base MUST be a fully opaque full-bleed square
  const squareStats = await sharp(path.join(colorDir, 'square.png')).stats();
  assert(squareStats.isOpaque, 'color/square.png must be fully opaque (full-bleed maskable/apple-touch base)');

  // 1. mono masks (real alpha, RGB white)
  await deriveWhiteMask(path.join(monoDir, 'mark2.black.png'), 'derived-mask-mark-white.png');
  await deriveWhiteMask(path.join(monoDir, 'crest2.black.png'), 'derived-mask-crest-white.png');

  // 2. Colour tile ladder (rounded, transparent corners) from tile master.
  //    512/192 feed the PWA "any" icons; 256/128/96 exist so size-aware BrandTile
  //    (AppHeader 36px, Auth 40px, Screenshot 118px) picks an appropriately small
  //    src via srcSet/sizes instead of every DOM touchpoint downloading the 512 (~277KB).
  await resizeAsset(path.join(colorDir, 'tile.png'), 512, 'derived-icon-512.png');
  await resizeAsset(path.join(colorDir, 'tile.png'), 256, 'derived-icon-256.png');
  await resizeAsset(path.join(colorDir, 'tile.png'), 192, 'derived-icon-192.png');
  await resizeAsset(path.join(colorDir, 'tile.png'), 128, 'derived-icon-128.png');
  await resizeAsset(path.join(colorDir, 'tile.png'), 96, 'derived-icon-96.png');

  // 3. PWA "maskable" + apple-touch (opaque full-bleed square, NO pre-rounded corners) from square master
  await resizeAsset(path.join(colorDir, 'square.png'), 512, 'derived-maskable-512.png', { opaque: true });
  await resizeAsset(path.join(colorDir, 'square.png'), 192, 'derived-maskable-192.png', { opaque: true });
  await resizeAsset(path.join(colorDir, 'square.png'), 180, 'derived-apple-touch-180.png', { opaque: true });

  // 4. favicons (flat master) + multi-res .ico
  const f16 = await resizeAsset(path.join(colorDir, 'flat.png'), 16, 'derived-favicon-16.png');
  const f32 = await resizeAsset(path.join(colorDir, 'flat.png'), 32, 'derived-favicon-32.png');
  const f48 = await resizeAsset(path.join(colorDir, 'flat.png'), 48, 'derived-favicon-48.png');
  const ico = packIco([{ size: 16, buf: f16 }, { size: 32, buf: f32 }, { size: 48, buf: f48 }]);
  assert(ico.readUInt16LE(0) === 0 && ico.readUInt16LE(2) === 1 && ico.readUInt16LE(4) === 3, 'favicon.ico must be a valid ICO with exactly 3 sizes (16/32/48)');
  record({ output: 'derived-favicon.ico', source: 'color/flat.png', sourceSha256: srcSha(path.join(colorDir, 'flat.png')),
    transform: 'ICO pack of derived-favicon-16/32/48 (embedded PNG)', dims: '16,32,48' }, ico);

  // (OG image is the signed-off gen-tool terminal, copied to src/app/opengraph-image.jpg — not generated here.)

  // provenance manifest
  const doc = {
    generatedBy: 'gen-brand-assets.cjs',
    note: 'Derived brand assets. Source-of-record = signed-off black-backed marks + colour masters, which MUST be committed to a NON-PUBLIC, version-controlled repo path (e.g. brand/source/, NOT public/). Mask alpha = mean of sRGB R,G,B (coverage proxy, NOT CIE luminance). Derived masks are transparent masks derived from black composites, NOT lossless reconstructions — recovery is formally under-determined. Clean because black backing is pure #000 and 0% of edge pixels exceed chroma>20 (max observed 11).',
    sources: {
      'mono/mark2.black.png': srcSha(path.join(monoDir, 'mark2.black.png')),
      'mono/crest2.black.png': srcSha(path.join(monoDir, 'crest2.black.png')),
      'mono/green2.black.png (record only, not shipped)': fs.existsSync(path.join(monoDir, 'green2.black.png')) ? srcSha(path.join(monoDir, 'green2.black.png')) : 'absent',
      'color/tile.png': srcSha(path.join(colorDir, 'tile.png')),
      'color/square.png': srcSha(path.join(colorDir, 'square.png')),
      'color/flat.png': srcSha(path.join(colorDir, 'flat.png')),
    },
    outputs: manifest,
  };
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(doc, null, 2));
  console.log('generated', manifest.length, 'assets ->', OUT);
  for (const m of manifest) console.log('  ' + m.output.padEnd(30) + ' ' + m.dims.padEnd(10) + ' ' + m.outputSha256.slice(0, 16) + ' (' + m.bytes + 'B)');
})();
