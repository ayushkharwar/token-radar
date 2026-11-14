// Token launch radar: a sealed snapshot of every protocol DefiLlama tracks in, one ranked board out.
//
// The program reads the snapshot (the grader mounts it at /input/snapshot.json; --input <file|dir>
// reads another copy), prices every pre-token protocol with the model in lib/model.ts, writes the
// ranked board to /output/board.json, writes the page's dataset to /output/data.js, copies this
// repository's dashboard/ and screenshots/ beside it, and writes /output/dossier.json last: the
// summary the judge reads, from vendor/makefun-board.ts, the library make.fun ships unchanged.
//
// --check writes nothing and verifies an output directory that already exists, one line per check:
// the board, the screenshots, the dashboard and the dossier. It exits 1 on the first failure, and a
// write run makes the same checks on the bytes it just wrote before it writes the dossier.
//
// Local run, outside the grader's container:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input snapshot.json
//   MAKEFUN_OUTPUT_DIR=out node main.ts --input snapshot.json --check

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot, selfTest } from './lib/model.ts';
import type { BoardRow, Snapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

/** The repository root, from this module's own address. */
const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's text cap: the dossier shows the dashboard's source up to this many bytes. */
const TEXT_MAX_BYTES = 65_536;
/** The scorer's screenshot caps: at most four images, each at most 512 KiB. */
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
/** The scorer's dashboard caps: at most 400 files and 4 MiB in all. */
const DASHBOARD_CAPS = { max_files: 400, max_bytes: 4_194_304 };
/** The same caps in the shape buildDossier takes, so the write and the rebuild cannot drift. */
const DOSSIER_CAPS = { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: DASHBOARD_CAPS };
/** The gate's image count: the board, a detail view and a filtered view, and one spare. */
const SHOT_COUNT = { min: 3, max: SCREENSHOT_CAPS.max };
/** The gate's image geometry: a long side at most 1440 and a short side at least 800 pixels. */
const SHOT_SIDE = { max: 1440, min: 800 };
/** The gate's row count: a board holds 100 to 4000 rows. */
const ROW_COUNT = { min: 100, max: 4_000 };
/** The gate's implied-value ceiling, in whole dollars. */
const IMPLIED_MAX = 100_000_000_000_000;
/** The gate's dossier cap: 1.5 MiB, past which the entry is refused whatever the bytes say. */
const DOSSIER_MAX_BYTES = 1_572_864;
/** The gate's file name: letters, digits and . _ - , 1 to 128 characters, not starting with . or -. */
const PLAIN_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/**
 * An address that fetches. It stays a regex, never a string, because this file keeps no URL inside
 * a string: the matcher only reports that an address is there.
 */
const SCHEME = /\bhttps?:\/\//i;
/** An HTML attribute whose value a browser fetches: href, src, action, poster and data. */
const HTML_ATTRIBUTE = /\b(?:href|src|action|poster|data)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`]+))/gi;
/** A CSS url(...) body, quoted or bare. */
const CSS_URL = /\burl\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s]*))\s*\)/gi;
/** A JavaScript module specifier: static import, re-export, dynamic import and CommonJS require. */
const JS_SPECIFIER = [
  /\bimport\s+(?:[^'"`;()]*?\s+from\s+)?(["'])([^"'\n]*)\1/g,
  /\bexport\s+(?:\*|\{[^}]*\})\s*(?:as\s+[\w$]+\s*)?from\s*(["'])([^"'\n]*)\1/g,
  /\bimport\s*\(\s*(["'])([^"'\n]*)\1\s*\)/g,
  /\brequire\s*\(\s*(["'])([^"'\n]*)\1\s*\)/g,
];
/** The bytes a PNG opens with. */
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** The JPEG start-of-image and end-of-image markers. */
const JPEG_SOI = 0xd8;
const JPEG_EOI = 0xd9;
/** The JPEG markers that carry the frame's size: every start-of-frame, except the huffman tables. */
const JPEG_FRAME = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

/** `--name <value>` out of the arguments, else `--name=<value>`, else the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

/** An error's own words, for a line a reader can act on. */
function text(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

/**
 * Every regular file below `dir`, by slash-separated relative path in code-unit order, with its
 * bytes: the scanner and the checker read the same list, so neither sees a file the other misses.
 */
function readTree(dir: string): { path: string; bytes: Buffer }[] {
  const files: { path: string; bytes: Buffer }[] = [];
  const walk = (from: string, prefix: string): void => {
    for (const entry of readdirSync(from, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(join(from, entry.name), path);
      else if (entry.isFile()) files.push({ path, bytes: readFileSync(join(from, entry.name)) });
      else throw new Error(`dashboard/${path} is neither a regular file nor a directory`);
    }
  };
  walk(dir, '');
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** The first HTML attribute value that names an address, or null. */
function attributeIssue(html: string): string | null {
  for (const m of html.matchAll(HTML_ATTRIBUTE)) {
    const value = m[1] ?? m[2] ?? m[3] ?? '';
    if (SCHEME.test(value)) return m[0];
  }
  return null;
}

/** The first CSS url(...) body that names an address, or null. */
function cssUrlIssue(css: string): string | null {
  for (const m of css.matchAll(CSS_URL)) {
    const body = m[1] ?? m[2] ?? m[3] ?? '';
    if (SCHEME.test(body)) return m[0];
  }
  return null;
}

/** The first module specifier that names an address, or null: the specifier, never a data string. */
function specifierIssue(js: string): string | null {
  for (const pattern of JS_SPECIFIER) {
    for (const m of js.matchAll(pattern)) {
      if (SCHEME.test(m[2] ?? '')) return m[0];
    }
  }
  return null;
}

/**
 * Why one dashboard file would fetch something, or null. Only the positions the gate reads are
 * matched: an attribute value, a url() body, a module specifier. A file's visible text and its
 * comments may carry an address, so a bare occurrence of the scheme is never an offence; the page's
 * dataset holds the snapshot's own source line, an address in a string, and stays clean.
 */
function fileNetworkIssue(path: string, bytes: Buffer): string | null {
  const body = bytes.toString('utf8');
  const dot = path.lastIndexOf('.');
  const ext = dot < 0 ? '' : path.slice(dot).toLowerCase();
  if (ext === '.html' || ext === '.htm') return attributeIssue(body) ?? cssUrlIssue(body) ?? specifierIssue(body);
  if (ext === '.css') return cssUrlIssue(body);
  if (ext === '.js' || ext === '.mjs') return specifierIssue(body);
  return null;
}

/**
 * Guarantee 1: the page renders with no network, so the scorer refuses an address in an attribute
 * value, a CSS url() or a module specifier. This finds it here, where the message can name the file
 * and the match, rather than in the gate, where the entry is simply invalid.
 */
function networkFreeIssue(files: { path: string; bytes: Buffer }[]): { path: string; match: string } | null {
  for (const file of files) {
    const match = fileNetworkIssue(file.path, file.bytes);
    if (match !== null) return { path: file.path, match };
  }
  return null;
}

/** The sides of a whole PNG, or null: the magic, the IHDR chunk, the size and a closing IEND. */
function pngSides(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length < 33) return null;
  if (!bytes.subarray(0, 8).equals(PNG_MAGIC)) return null;
  if (bytes.readUInt32BE(8) !== 13) return null;
  if (bytes.toString('latin1', 12, 16) !== 'IHDR') return null;
  if (bytes.toString('latin1', bytes.length - 8, bytes.length - 4) !== 'IEND') return null;
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  return width > 0 && height > 0 ? { width, height } : null;
}

/** The sides of a whole JPEG, or null: a start marker, a frame header and an end marker. */
function jpegSides(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length < 16) return null;
  if (bytes[0] !== 0xff || bytes[1] !== JPEG_SOI) return null;
  if (bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== JPEG_EOI) return null;
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return null;
    let marker = bytes[at + 1]!;
    while (marker === 0xff && at + 2 < bytes.length) {
      at++;
      marker = bytes[at + 1]!;
    }
    at += 2;
    if (marker === JPEG_EOI || marker === 0xda) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (at + 2 > bytes.length) return null;
    const length = bytes.readUInt16BE(at);
    if (length < 2) return null;
    if (JPEG_FRAME.has(marker)) {
      if (at + 7 > bytes.length) return null;
      const height = bytes.readUInt16BE(at + 3);
      const width = bytes.readUInt16BE(at + 5);
      return width > 0 && height > 0 ? { width, height } : null;
    }
    at += length;
  }
  return null;
}

/** The pixel sides of a whole PNG or JPEG, or null: a cut or unknown file fails here. */
function imageSides(bytes: Buffer): { width: number; height: number } | null {
  return pngSides(bytes) ?? jpegSides(bytes);
}

/** The dossier these caps make from an output directory: the gate's own rebuild, byte for byte. */
function rebuildDossier(out: string): Buffer {
  return Buffer.from(buildDossier(out, DOSSIER_CAPS));
}

/**
 * Guarantee 2: the gate's dossier_matches row rebuilds the dossier from the same output and
 * compares bytes. Rebuilding here proves the write is reproducible before the entry is handed in,
 * and catches a page or an image that changed after the dossier was made. The gate also refuses a
 * dossier past 1.5 MiB, and a rebuild equal to one over the cap is still refused, so the cap is
 * checked here rather than by a byte compare that would pass.
 */
function verifyDossier(out: string): number {
  const written = readFileSync(join(out, 'dossier.json'));
  const rebuilt = rebuildDossier(out);
  if (!written.equals(rebuilt)) {
    throw new Error(
      `dossier.json is ${written.length} bytes and a rebuild of the same output is ${rebuilt.length}: the gate compares them byte for byte`,
    );
  }
  if (written.length > DOSSIER_MAX_BYTES) {
    throw new Error(`dossier.json is ${written.length} bytes, over the gate's ${DOSSIER_MAX_BYTES}`);
  }
  return written.length;
}

/** Why a row is not one the gate takes, or null: the five fields, their types and their ranges. */
function rowShapeIssue(rows: unknown[]): string | null {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (typeof row !== 'object' || row === null || Array.isArray(row)) return `row ${i + 1} is not an object`;
    const r = row as Record<string, unknown>;
    if (typeof r.slug !== 'string' || r.slug.length < 1 || r.slug.length > 128 || /\s/.test(r.slug)) return `row ${i + 1} has no slug the gate takes`;
    if (typeof r.name !== 'string' || r.name.length === 0) return `row ${i + 1} has no name`;
    if (typeof r.rank !== 'number' || !Number.isSafeInteger(r.rank) || r.rank <= 0) return `row ${i + 1} has no positive whole rank`;
    const value = r.implied_value_usd;
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0 || value > IMPLIED_MAX) return `row ${i + 1} has no implied value within $1 to $100 trillion`;
    const steps = r.farm_steps;
    if (!Array.isArray(steps) || steps.length < 3 || steps.length > 12) return `row ${i + 1} does not hold 3 to 12 farm steps`;
    for (const step of steps) {
      if (typeof step !== 'string' || step.trim().length < 20 || step.trim().length > 600) return `row ${i + 1} holds a farm step outside 20 to 600 characters`;
    }
  }
  return null;
}

/** board.json: it parses, its rows keep the gate's shape, and coverage, ranks and order hold. */
function checkBoardFile(out: string, snapshot: Snapshot): string {
  const path = join(out, 'board.json');
  if (!existsSync(path)) throw new Error('no board.json in the output');
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error('board.json does not parse as JSON');
  }
  const rows = Array.isArray(raw)
    ? raw
    : typeof raw === 'object' && raw !== null && Array.isArray((raw as { rows?: unknown }).rows)
      ? (raw as { rows: unknown[] }).rows
      : null;
  if (rows === null) throw new Error('board.json holds no rows array');
  if (rows.length < ROW_COUNT.min || rows.length > ROW_COUNT.max) {
    throw new Error(`board.json holds ${rows.length} rows, outside ${ROW_COUNT.min} to ${ROW_COUNT.max}`);
  }
  const shape = rowShapeIssue(rows);
  if (shape !== null) throw new Error(shape);
  const board = rows as BoardRow[];
  const issue = boardIssue(board, snapshot);
  if (issue !== null) throw new Error(issue);
  const present = new Set(board.map((r) => r.slug));
  const covered = snapshot.watchlist.filter((slug) => present.has(slug)).length;
  return `${board.length} rows, watchlist ${covered} of ${snapshot.watchlist.length}, ranks 1 to ${board.length}, implied value never rises`;
}

/** screenshots/: the gate's count, names, byte cap, whole image and pixel sides. */
function checkScreenshots(out: string): string {
  const dir = join(out, 'screenshots');
  if (!existsSync(dir)) throw new Error('no screenshots/ directory in the output');
  const entries = readdirSync(dir, { withFileTypes: true })
    .filter((e) => !e.name.startsWith('.'))
    .sort((a, b) => (a.name < b.name ? -1 : 1));
  if (entries.length < SHOT_COUNT.min || entries.length > SHOT_COUNT.max) {
    throw new Error(`screenshots/ holds ${entries.length} images, outside ${SHOT_COUNT.min} to ${SHOT_COUNT.max}`);
  }
  let largest = 0;
  for (const entry of entries) {
    if (!entry.isFile()) throw new Error(`screenshots/${entry.name} is not a regular file`);
    if (!PLAIN_NAME.test(entry.name)) throw new Error(`screenshots/${entry.name}: a name is letters, digits and . _ -, 1 to 128 characters`);
    const bytes = readFileSync(join(dir, entry.name));
    if (bytes.length > SCREENSHOT_CAPS.max_bytes) {
      throw new Error(`screenshots/${entry.name} is ${bytes.length} bytes, over ${SCREENSHOT_CAPS.max_bytes}`);
    }
    const sides = imageSides(bytes);
    if (sides === null) throw new Error(`screenshots/${entry.name} is not a whole PNG or JPEG`);
    const long = Math.max(sides.width, sides.height);
    const short = Math.min(sides.width, sides.height);
    if (long > SHOT_SIDE.max) throw new Error(`screenshots/${entry.name} is ${sides.width} by ${sides.height}: long side over ${SHOT_SIDE.max}`);
    if (short < SHOT_SIDE.min) throw new Error(`screenshots/${entry.name} is ${sides.width} by ${sides.height}: short side under ${SHOT_SIDE.min}`);
    largest = Math.max(largest, bytes.length);
  }
  return `${entries.length} images, whole PNG or JPEG, largest ${Math.ceil(largest / 1024)} KiB, long side at most ${SHOT_SIDE.max}, short side at least ${SHOT_SIDE.min}`;
}

/** dashboard/: the gate's count, byte cap, plain names, page shape and no reachable address. */
function checkDashboard(out: string): string {
  const dir = join(out, 'dashboard');
  if (!existsSync(dir)) throw new Error('no dashboard/ directory in the output');
  const files = readTree(dir);
  if (files.length === 0) throw new Error('dashboard/ holds no file');
  if (files.length > DASHBOARD_CAPS.max_files) throw new Error(`dashboard/ holds ${files.length} files, over ${DASHBOARD_CAPS.max_files}`);
  const total = files.reduce((n, f) => n + f.bytes.length, 0);
  if (total > DASHBOARD_CAPS.max_bytes) throw new Error(`dashboard/ holds ${total} bytes, over ${DASHBOARD_CAPS.max_bytes}`);
  for (const file of files) {
    for (const part of file.path.split('/')) {
      if (part.startsWith('.')) throw new Error(`dashboard/${file.path}: a directory or file starts with a dot`);
    }
    const name = file.path.slice(file.path.lastIndexOf('/') + 1);
    if (!PLAIN_NAME.test(name)) throw new Error(`dashboard/${file.path}: a file name is letters, digits and . _ -, 1 to 128 characters`);
  }
  const reach = networkFreeIssue(files);
  if (reach !== null) throw new Error(`dashboard/${reach.path} names ${reach.match}, which reaches the network`);
  if (!files.some((f) => f.path === 'index.html')) throw new Error('dashboard/ holds no index.html');
  const css = files.filter((f) => f.path.endsWith('.css')).length;
  const js = files.filter((f) => f.path.endsWith('.js') || f.path.endsWith('.mjs')).length;
  if (css === 0) throw new Error('dashboard/ holds no .css file');
  if (js === 0) throw new Error('dashboard/ holds no .js file');
  return `${files.length} files, ${total} bytes, plain names, index.html, ${css} css and ${js} js, no network address`;
}

/** dossier.json: it is the dossier a rebuild of this same output makes, and under the gate's cap. */
function checkDossierFile(out: string): string {
  if (!existsSync(join(out, 'dossier.json'))) throw new Error('no dossier.json in the output');
  const bytes = verifyDossier(out);
  return `${bytes} bytes, equal to a rebuild with the ${TEXT_MAX_BYTES}-byte text cap, under the ${DOSSIER_MAX_BYTES}-byte cap`;
}

/** Guarantee 3: verify an output directory in place, one line per check, exit 1 on the first miss. */
function runCheck(out: string, snapshot: Snapshot): void {
  // The model's own properties come first: a broken median or a winsoriser that eats the middle
  // makes every number below meaningless, so it fails here, before the files are read.
  const properties = selfTest();
  process.stdout.write(`check self-test: ${properties.length} properties pass\n`);
  const checks: { label: string; run: () => string }[] = [
    { label: 'board', run: () => checkBoardFile(out, snapshot) },
    { label: 'screenshots', run: () => checkScreenshots(out) },
    { label: 'dashboard', run: () => checkDashboard(out) },
    { label: 'dossier', run: () => checkDossierFile(out) },
  ];
  for (const check of checks) {
    try {
      process.stdout.write(`check ${check.label}: ${check.run()}: ok\n`);
    } catch (err) {
      process.stdout.write(`check ${check.label}: failed: ${text(err)}\n`);
      process.exit(1);
    }
  }
  process.stdout.write(`check: all ${checks.length} pass, nothing written, output ${out}\n`);
}

/**
 * The board, the page's data, the dashboard, the screenshots and the dossier, in that order. The
 * writer then runs the three checks --check runs, on the bytes it just wrote: a screenshot the gate
 * refuses for its sides, or a page with no index.html, or a link that reaches the network, fails
 * here with the reason instead of after the entry is handed in.
 */
function writeOutput(out: string, snapshot: Snapshot): void {
  const { board, radar } = buildRadar(snapshot);
  const issue = boardIssue(board, snapshot);
  if (issue !== null) throw new Error(`the model wrote a board the gate refuses: ${issue}`);

  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
  writeFileSync(join(out, 'data.js'), dataScript(radar));

  const shotsFrom = join(here, 'screenshots');
  if (!existsSync(shotsFrom)) throw new Error('screenshots/ is missing: hand in the board, a detail view and a filtered view');
  const dashboard = copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
  const shots = copyFiles(shotsFrom, join(out, 'screenshots'));

  checkBoardFile(out, snapshot);
  checkScreenshots(out);
  checkDashboard(out);

  // The dossier is written last: the gate rebuilds it from this output and compares the bytes.
  writeFileSync(join(out, 'dossier.json'), rebuildDossier(out));
  const dossierBytes = verifyDossier(out);

  process.stdout.write(
    `token radar: wrote ${board.length} rows to board.json, one dataset to data.js, ${dashboard.length} dashboard files, ` +
      `${shots.length} screenshots and a ${dossierBytes}-byte dossier\n`,
  );
  // Guarantee 4: one line with the numbers a reader of the run wants first.
  process.stdout.write(
    `token radar: ${snapshot.protocols.length} protocols in the snapshot, ${radar.watchlist_size} on the watchlist, ` +
      `${board.length} rows written, ${radar.peers.length} peer categories, field median mcap/tvl ${radar.field_median} ` +
      `over ${radar.field_sample} live protocols, output ${out}\n`,
  );
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}

try {
  const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
  if (process.argv.includes('--check')) runCheck(out, snapshot);
  else writeOutput(out, snapshot);
} catch (err) {
  process.stderr.write(`token radar: ${text(err)}\n`);
  process.exit(1);
}
