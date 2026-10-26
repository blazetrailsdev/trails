/**
 * Differential fuzz of the RFC 0207 ports (`@blazetrails/fugit`, `et-orbi`,
 * `chronic`, and `raabro` beneath them) against the vendored Ruby gems.
 *
 * One batch of cases goes to `driver.rb`, which loads the gems from `vendor/`,
 * and to the built TS packages; the two JSON results are compared case by
 * case. The fixed seed corpus (`corpus.txt`) runs first, then generated
 * inputs, all reproducible from `--seed`.
 *
 *   pnpm build
 *   TZ=UTC pnpm tsx scripts/fugit-fuzz/fuzz.ts --seed 1 --count 10000
 *   TZ=UTC pnpm tsx scripts/fugit-fuzz/fuzz.ts --surface cron --count 500
 *   TZ=UTC pnpm tsx scripts/fugit-fuzz/fuzz.ts --pp cron "0 0 L * mon"
 *
 * The Ruby side reads a zoneinfo compiled from the IANA release Node's ICU
 * carries (`process.versions.tz`), not the host's `/usr/share/zoneinfo`, so
 * both sides see the same zone database. It is downloaded and built with
 * `zic` on first run, into `node_modules/.cache/fugit-fuzz/`, after its
 * signature is checked against the tz release key.
 *
 * Not wired into CI.
 */
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Fugit } from "../../packages/fugit/dist/fugit.js";
import { EoTime, EtOrbi } from "../../packages/et-orbi/dist/et-orbi.js";
import { Chronic } from "../../packages/chronic/dist/chronic.js";
import { Raabro, Tree } from "../../packages/raabro/dist/raabro.js";
import { Time } from "../../packages/date/dist/index.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VENDOR = path.resolve(HERE, "../../vendor");
const GEMS = "fugit/v1.11.1 raabro/v1.4.0 et-orbi/v1.2.11 chronic/v0.10.2".split(" ");

type Case =
  | { k: "parse" | "eo"; s: string; label?: string }
  | { k: "cron" | "dur"; s: string; from: number; zone: string }
  | { k: "chronic"; s: string; now: number };
type Surface = Case["k"];
const SURFACES: Surface[] = ["parse", "cron", "dur", "eo", "chronic"];

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Gen {
  constructor(readonly r: () => number) {}
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.r() * (hi - lo + 1));
  }
  pick<T>(a: readonly T[]): T {
    return a[Math.floor(this.r() * a.length)];
  }
  chance(p: number): boolean {
    return this.r() < p;
  }
}

const ZONES =
  "UTC America/New_York Europe/Berlin Asia/Tokyo America/Santiago Australia/Melbourne Asia/Kolkata America/Sao_Paulo Europe/London PST8PDT Etc/GMT-11 Pacific/Chatham Asia/Tehran Africa/Casablanca".split(
    " ",
  );
const MONTHS = "jan feb mar apr may jun jul aug sep oct nov dec".split(" ");
const DAYS = "sun mon tue wed thu fri sat".split(" ");
const JUNK = [" ", "  ", "\t", ",", "-", "/", "*", "#", "%", "L", "x", "?", "+", ":", "."];

function cronItem(g: Gen, lo: number, hi: number, names?: string[]): string {
  const n = () =>
    g.chance(0.05)
      ? String(g.int(hi + 1, hi + 40))
      : names && g.chance(0.3)
        ? g.pick(names)
        : String(g.int(lo, hi));
  return g.pick([
    () => "*",
    () => `*/${g.int(1, hi + 2)}`,
    () => `${n()}-${n()}`,
    () => `${n()}-${n()}/${g.int(1, 12)}`,
    () => `${n()}/${g.int(1, 30)}`,
    n,
    n,
  ])();
}

function cronField(g: Gen, lo: number, hi: number, names?: string[]): string {
  const count = g.chance(0.75) ? 1 : g.int(2, 4);
  return Array.from({ length: count }, () => cronItem(g, lo, hi, names)).join(",");
}

function genCron(g: Gen): string {
  if (g.chance(0.05)) {
    return g.pick("@yearly @annually @monthly @weekly @daily @midnight @hourly @reboot".split(" "));
  }
  let dom = cronField(g, 1, 31);
  if (g.chance(0.1)) dom = g.pick("L -1 -2 -5 L-2 1,L 15,-1".split(" "));
  let dow = cronField(g, 0, 7, DAYS);
  if (g.chance(0.15)) {
    const d = g.pick([...DAYS, "1", "2", "5"]);
    dow = g.pick([
      `${d}#${g.int(1, 5)}`,
      `${d}#-${g.int(1, 2)}`,
      `${d}%${g.int(1, 4)}`,
      `${d}%${g.int(2, 4)}+${g.int(1, 3)}`,
      `${d}#L`,
    ]);
  }
  const fields = [cronField(g, 0, 59), cronField(g, 0, 23), dom, cronField(g, 1, 12, MONTHS), dow];
  if (g.chance(0.15)) fields.unshift(cronField(g, 0, 59));
  if (g.chance(0.3)) fields.push(g.pick(ZONES));
  return fields.join(g.chance(0.05) ? "  " : " ");
}

const UNITS = "y M w d h m s".split(" ");
const LONG_UNITS =
  "year years month months week weeks day days hour hours minute minutes second seconds sec min".split(
    " ",
  );

function genNumber(g: Gen): string {
  const n = String(g.int(0, g.pick([3, 60, 1000])));
  if (g.chance(0.2)) return `${n}.${g.int(0, 99)}`;
  return n;
}

function genDuration(g: Gen): string {
  const parts: string[] = [];
  const style = g.int(0, 3);
  for (let i = g.int(1, 4); i > 0; i--) {
    const sign = g.chance(0.15) ? g.pick(["-", "+"]) : "";
    if (style === 0) parts.push(`${sign}${genNumber(g)}${g.pick(UNITS)}`);
    else if (style === 1) parts.push(`${sign}${genNumber(g)} ${g.pick(LONG_UNITS)}`);
    else parts.push(`${sign}${genNumber(g)}${g.pick("Y M W D".split(" "))}`);
  }
  if (style === 2) return `P${parts.join("")}`;
  if (style === 3)
    return `P${parts.slice(0, 1).join("")}T${genNumber(g)}${g.pick(["H", "M", "S"])}`;
  return parts.join(g.pick(["", " ", ", ", " and "]));
}

function genClock(g: Gen): string {
  return g.pick([
    `${g.int(0, 12)}${g.pick(["am", "pm", " am", " pm"])}`,
    `${g.int(0, 24)}:${String(g.int(0, 59)).padStart(2, "0")}`,
    `${g.int(1, 12)}:${String(g.int(0, 59)).padStart(2, "0")}${g.pick(["am", "pm", " pm"])}`,
    "noon",
    "midnight",
  ]);
}

function genNat(g: Gen): string {
  const what = g.pick([
    "day",
    "hour",
    "minute",
    "weekday",
    `${g.int(1, 30)} ${g.pick("minutes hours days seconds months".split(" "))}`,
    `${g.int(1, 59)}${g.pick(["m", "h", "s"])}`,
    g.pick(DAYS),
    `${g.pick(DAYS)}${g.pick([",", "-", " and "])}${g.pick(DAYS)}`,
    `${g.int(1, 28)}${g.pick("st nd rd th".split(" "))} of the month`,
    "month",
  ]);
  let s = `${g.pick(["every", "Every", "each"])} ${what}`;
  if (g.chance(0.6)) {
    s += ` at ${genClock(g)}`;
    if (g.chance(0.3)) s += ` and ${genClock(g)}`;
  }
  if (g.chance(0.15)) s += ` at minute ${g.int(0, 59)}`;
  if (g.chance(0.3)) s += ` ${g.pick(["", "on ", "in "])}${g.pick(ZONES)}`;
  return s;
}

function genStamp(g: Gen): string {
  const y = g.int(1970, 2040);
  const pad = (n: number) => String(n).padStart(2, "0");
  let s = `${y}-${pad(g.int(1, 12))}-${pad(g.int(1, 31))}`;
  if (g.chance(0.85)) {
    s += `${g.pick([" ", "T"])}${pad(g.int(0, 23))}:${pad(g.int(0, 59))}`;
    if (g.chance(0.7)) s += `:${pad(g.int(0, 59))}`;
    if (g.chance(0.2)) s += `.${g.int(0, 999999)}`;
  }
  const off = `${g.pick(["+", "-"])}${pad(g.int(0, 14))}${g.pick([":", ""])}${g.pick(["00", "30", "45"])}`;
  const zone = g.pick([
    "",
    "",
    "Z",
    ` ${off}`,
    off,
    ` ${g.pick(ZONES)}`,
    " UTC",
    " EST",
    " CET",
    " JST",
  ]);
  return s + zone;
}

function genChronic(g: Gen): string {
  return g.pick([
    () =>
      g.pick(
        "today|tomorrow|yesterday|now|noon|midnight|this morning|tonight|this second".split("|"),
      ),
    () =>
      `${g.pick(["next", "last", "this"])} ${g.pick([...DAYS, "week", "month", "year", "monday", "friday", "weekend", "fall", "summer"])}`,
    () =>
      `${g.int(1, 30)} ${g.pick("days weeks hours minutes months years seconds".split(" "))} ${g.pick(["ago", "from now", "hence", "before now"])}`,
    () =>
      `${g.pick(MONTHS)} ${g.int(1, 31)}${g.pick(["", "st", "th"])}${g.pick(["", ` ${g.int(1970, 2030)}`])}`,
    () => `${g.int(1, 12)}/${g.int(1, 31)}/${g.int(1, 2030)}`,
    () => `${g.pick(["tomorrow", "yesterday", "today", g.pick(DAYS)])} at ${genClock(g)}`,
    () => `${genClock(g)} ${g.pick(["tomorrow", "today", "yesterday", "on monday"])}`,
    () => genStamp(g),
    () =>
      `${g.pick("3rd first last 2nd".split(" "))} ${g.pick(DAYS)} ${g.pick(["in", "of"])} ${g.pick(MONTHS)}`,
  ])();
}

function mutate(g: Gen, s: string): string {
  if (!g.chance(0.2) || s.length === 0) return s;
  const i = g.int(0, s.length);
  return g.pick([
    () => s.slice(0, i) + g.pick(JUNK) + s.slice(i),
    () => s.slice(0, i) + s.slice(i + 1),
    () => ` ${s} `,
    () => s.toUpperCase(),
  ])();
}

/** Start instants: month ends, leap days and the DST changes of the zones above. */
function genFrom(g: Gen): number {
  const base = g.pick([
    1709164799000, 1709208000000, 1704065400000, 1710052200000, 1711845000000, 1729990740000,
    1730613540000, 1712415600000, 1738324800000, 1619823600000,
  ]);
  return base / 1000 + g.int(-3, 3) * 3600 + g.pick([0, 0, 1, 59, 1800]);
}

function generate(g: Gen, k: Surface): Case {
  switch (k) {
    case "parse":
      return { k, s: mutate(g, g.pick([genCron, genDuration, genNat, genStamp])(g)) };
    case "cron":
      return {
        k,
        s: mutate(g, g.chance(0.8) ? genCron(g) : genNat(g)),
        from: genFrom(g),
        zone: g.pick(ZONES),
      };
    case "dur":
      return { k, s: mutate(g, genDuration(g)), from: genFrom(g), zone: g.pick(ZONES) };
    case "eo":
      return { k, s: mutate(g, genStamp(g)) };
    case "chronic":
      return { k, s: mutate(g, genChronic(g)), now: 1155736800 + g.int(-400, 400) * 86400 };
  }
}

const CORPUS_FROM = [1704067200, 1710054000, 1730595600];
const CORPUS_ZONES = ["UTC", "America/New_York", "Europe/Berlin"];

async function corpus(): Promise<Case[]> {
  const lines = (await readFile(path.join(HERE, "corpus.txt"), "utf8"))
    .split("\n")
    .filter((l) => l);
  const cases: Case[] = [];
  for (const line of lines) {
    const s = line.slice(10);
    cases.push({ k: "parse", s, label: `Fugit::${line.slice(0, 10).trim()}` });
    for (const from of CORPUS_FROM)
      for (const zone of CORPUS_ZONES) cases.push({ k: "cron", s, from, zone });
  }
  return cases;
}

function num(f: unknown): number | string {
  const n = Number(f);
  return Number.isFinite(n) ? n : String(n);
}

function eo(t: EoTime): [number | string, string] {
  return [num(t.toF()), t.zone.name];
}

/** A JS `TypeError` from a call on `undefined` is the port's `NoMethodError` (CLAUDE.md, "Ruby protocol methods"). */
function errName(e: unknown): { err: string } {
  const name = e instanceof Error ? e.constructor.name : typeof e;
  const missing = /is not a function|Cannot read properties of (undefined|null)/;
  return {
    err: name === "TypeError" && missing.test((e as Error).message) ? "NoMethodError" : name,
  };
}

function guard(f: () => unknown): unknown {
  try {
    return f();
  } catch (e) {
    if (process.env.FUZZ_STACK && e instanceof Error) console.error(e.stack);
    return errName(e);
  }
}

function fugitValue(o: unknown): unknown {
  if (o == null) return null;
  if (Array.isArray(o)) return ["Array", o.map(fugitValue)];
  if (o instanceof Fugit.Cron) return ["Fugit::Cron", o.toCronS()];
  if (o instanceof Fugit.Duration) {
    const h = Object.fromEntries(Object.entries(o.toH()).map(([k, v]) => [k, num(v)]));
    return ["Fugit::Duration", o.deflate().toPlainS(), h];
  }
  if (o instanceof EoTime) return ["EtOrbi::EoTime", ...eo(o)];
  return [(o as object).constructor.name, String(o)];
}

function runTs(c: Case): unknown {
  return guard(() => {
    switch (c.k) {
      case "parse":
        return fugitValue(Fugit.parse(c.s));
      case "cron": {
        const o = Fugit.parse(c.s);
        if (!(o instanceof Fugit.Cron)) return fugitValue(o);
        const from = new EoTime(c.from, c.zone);
        const nexts: unknown[] = [];
        const prevs: unknown[] = [];
        let t = from;
        for (let i = 0; i < 5; i++) nexts.push(eo((t = o.nextTime(t))));
        t = from;
        for (let i = 0; i < 5; i++) prevs.push(eo((t = o.previousTime(t))));
        return [o.toCronS(), nexts, prevs];
      }
      case "dur": {
        const d = Fugit.parseDuration(c.s);
        if (d == null) return null;
        return [
          d.toPlainS(),
          d.deflate().toPlainS(),
          d.toIsoS(),
          d.toLongS(),
          num(d.toSec()),
          guard(() => eo(d.add(new EoTime(c.from, c.zone)) as EoTime)),
          guard(() => eo(new EoTime(c.from, c.zone).minus(d as never) as unknown as EoTime)),
        ];
      }
      case "eo": {
        const t = EtOrbi.parse(c.s);
        return [
          ...eo(t),
          t.toString(),
          t.utcOffset(),
          t.strftime("%Y-%m-%d %H:%M:%S.%L %z %:z %Z %a %j %U %u"),
          t.toDebugS(),
        ];
      }
      case "chronic": {
        const r = Chronic.parse(c.s, { now: Time.at(c.now).utc() });
        return r == null ? null : num((r as { toF(): number }).toF());
      }
    }
  });
}

/** The tz release-signing key, Paul Eggert's (https://www.iana.org/time-zones). */
const TZ_RELEASE_KEY = "7E3792A9D8ACF7D633BC1588ED97E90E62AA7E34";

function verifyTzdata(src: string, tarball: string, url: string): void {
  const home = path.join(src, "gnupg");
  mkdirSync(home, { mode: 0o700 });
  const key = path.join(src, "key.asc");
  const sig = `${tarball}.asc`;
  execFileSync("curl", [
    "-fsSL",
    "-o",
    key,
    `https://keys.openpgp.org/vks/v1/by-fingerprint/${TZ_RELEASE_KEY}`,
  ]);
  execFileSync("curl", ["-fsSL", "-o", sig, `${url}.asc`]);
  execFileSync("gpg", ["--homedir", home, "--batch", "--quiet", "--import", key], {
    stdio: "ignore",
  });
  const status = spawnSync(
    "gpg",
    ["--homedir", home, "--batch", "--status-fd", "1", "--verify", sig, tarball],
    { encoding: "utf8" },
  );
  if (status.status !== 0 || !status.stdout.includes(`[GNUPG:] VALIDSIG ${TZ_RELEASE_KEY} `))
    throw new Error(`${url} is not signed by the tz release key ${TZ_RELEASE_KEY}`);
}

function zoneinfo(): string {
  const version = process.versions.tz;
  if (!version) throw new Error("this Node carries no ICU tz version");
  const dir = path.resolve(HERE, "../../node_modules/.cache/fugit-fuzz", `zoneinfo-${version}`);
  if (existsSync(dir)) return dir;
  const src = mkdtempSync(path.join(os.tmpdir(), "fugit-fuzz-tzdata-"));
  mkdirSync(path.dirname(dir), { recursive: true });
  const build = mkdtempSync(`${dir}.partial-`);
  try {
    const tarball = path.join(src, "tzdata.tar.gz");
    const url = `https://data.iana.org/time-zones/releases/tzdata${version}.tar.gz`;
    execFileSync("curl", ["-fsSL", "-o", tarball, url]);
    verifyTzdata(src, tarball, url);
    execFileSync("tar", ["xzf", tarball, "-C", src]);
    const sources =
      "africa antarctica asia australasia europe northamerica southamerica etcetera backward factory";
    const zic = spawnSync("zic", ["-d", build, ...sources.split(" ")], {
      cwd: src,
      encoding: "utf8",
    });
    const warnings = zic.stderr
      .split("\n")
      .filter((l) => l !== "" && !l.includes("symbolic link used because hard link failed"));
    if (warnings.length > 0) process.stderr.write(`${warnings.join("\n")}\n`);
    if (zic.status !== 0) throw new Error(`zic exited ${zic.status}`);
    for (const tab of ["iso3166.tab", "zone.tab", "zone1970.tab"])
      copyFileSync(path.join(src, tab), path.join(build, tab));
    try {
      renameSync(build, dir);
    } catch (e) {
      if (!existsSync(dir)) throw e;
    }
  } finally {
    rmSync(src, { recursive: true, force: true });
    rmSync(build, { recursive: true, force: true });
  }
  return dir;
}

let zoneinfoDir: string | undefined;

function runRuby(script: string[], input: string): Promise<string> {
  const args = GEMS.flatMap((gem) => ["-I", path.join(VENDOR, gem, "lib")]);
  const env = { ...process.env, TZ: "UTC", FUGIT_FUZZ_ZONEINFO: (zoneinfoDir ??= zoneinfo()) };
  return new Promise((resolve, reject) => {
    const child = spawn("ruby", [...args, ...script], { env });
    let out = "";
    child.stdout.on("data", (d: Buffer) => (out += d.toString()));
    child.stderr.on("data", (d: Buffer) => process.stderr.write(d));
    child.on("close", (code) =>
      code === 0 ? resolve(out) : reject(new Error(`ruby exited ${code}`)),
    );
    child.stdin.end(input);
  });
}

async function ppBoth(parser: string, s: string): Promise<void> {
  const mod = parser[0].toUpperCase() + parser.slice(1);
  const rb = `require "fugit"; t = Fugit::${mod}::Parser.parse($stdin.read, rewrite: false); t ? Raabro.pp(t) : p(t)`;
  console.log(`ruby:\n${await runRuby(["-e", rb], s)}ts:`);
  const t = (
    Fugit as unknown as Record<string, { Parser: { parse(s: string, o: object): unknown } }>
  )[mod].Parser.parse(s, { rewrite: false });
  if (t instanceof Tree) Raabro.pp(t);
  else console.log(String(t));
}

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? fallback : process.argv[i + 1];
}

async function main(): Promise<void> {
  if (process.argv.includes("--pp")) {
    const i = process.argv.indexOf("--pp");
    return ppBoth(process.argv[i + 1], process.argv[i + 2]);
  }
  const seed = Number(arg("seed", String(Date.now() % 1e9)));
  const count = Number(arg("count", "1000"));
  const surfaces = arg("surface", SURFACES.join(",")).split(",") as Surface[];
  const g = new Gen(rng(seed));
  const cases = (await corpus()).filter((c) => surfaces.includes(c.k));
  for (const k of surfaces) for (let i = 0; i < count; i++) cases.push(generate(g, k));
  console.log(`seed ${seed}: ${cases.length} cases`);

  const groups = new Map<string, { c: Case; ruby: unknown; ts: unknown }[]>();
  const BATCH = 500;
  const batches: Case[][] = [];
  for (let i = 0; i < cases.length; i += BATCH) batches.push(cases.slice(i, i + BATCH));
  const pending: Promise<unknown[]>[] = [];
  let next = 0;
  const startRuby = () => {
    const batch = batches[next++];
    if (batch)
      pending.push(
        runRuby([path.join(HERE, "driver.rb")], JSON.stringify(batch)).then(
          (o) => JSON.parse(o) as unknown[],
        ),
      );
  };
  for (let i = 0; i < 4; i++) startRuby();
  let done = 0;
  for (const [b, batch] of batches.entries()) {
    const tss = batch.map(runTs);
    const ruby = await pending[b];
    startRuby();
    done += batch.length;
    console.error(`  ${done}/${cases.length}`);
    batch.forEach((c, j) => {
      const ts = tss[j];
      const labelled = "label" in c && c.label !== undefined;
      if (labelled && (ruby[j] as unknown[] | null)?.[0] !== c.label) {
        const key = `${c.k}: corpus label ${c.label} vs ruby`;
        groups.set(key, [...(groups.get(key) ?? []), { c, ruby: ruby[j], ts }]);
      }
      if (same(ruby[j], ts) || nowRelative(c, ruby[j], ts)) return;
      const key = `${c.k}: ${signature(ruby[j], ts)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push({ c, ruby: ruby[j], ts });
    });
  }
  for (const [key, list] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n== ${key} (${list.length})`);
    for (const d of list.sort((a, b) => a.c.s.length - b.c.s.length).slice(0, 3)) {
      console.log(JSON.stringify(d.c));
      console.log(`  ruby: ${JSON.stringify(d.ruby)}`);
      console.log(`  ts:   ${JSON.stringify(d.ts)}`);
    }
  }
  const total = [...groups.values()].reduce((n, l) => n + l.length, 0);
  console.log(`\nseed ${seed}: ${total} divergent of ${cases.length}, ${groups.size} groups`);
}

/** Deep equality, with numbers equal to within float noise (1e-9 relative). */
function same(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") {
    return a === b || Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a));
  }
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((v, i) => same(v, b[i]));
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a);
    return same(ka, Object.keys(b)) && ka.every((k) => same((a as never)[k], (b as never)[k]));
  }
  return a === b;
}

/**
 * `Fugit.parse` hands a phrase to `EtOrbi.parse`, and through it to Chronic,
 * relative to the current time, which the two processes read moments apart.
 */
function nowRelative(c: Case, a: unknown, b: unknown): boolean {
  if ((c.k !== "parse" && c.k !== "cron") || !Array.isArray(a) || !Array.isArray(b)) return false;
  if (a[0] !== "EtOrbi::EoTime" || b[0] !== "EtOrbi::EoTime") return false;
  return a[2] === b[2] && Math.abs((a[1] as number) - (b[1] as number)) <= 600;
}

/** Where two results first differ, as a path plus the two value kinds. */
function signature(a: unknown, b: unknown, at = ""): string {
  const kind = (v: unknown) =>
    v === null
      ? "nil"
      : Array.isArray(v)
        ? "array"
        : typeof v === "object"
          ? `err ${(v as { err?: string }).err}`
          : typeof v;
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    const i = a.findIndex((v, j) => !same(v, b[j]));
    return signature(a[i], b[i], `${at}[${i}]`);
  }
  return `${at || "result"} ${kind(a)} vs ${kind(b)}`;
}

void main();
