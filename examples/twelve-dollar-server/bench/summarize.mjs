// Folds one bench/run.sh pass into a single JSON record for perf/history.jsonl.
import { readFile, readdir } from "node:fs/promises";
import { cpus } from "node:os";

const [out, before, after, peak, wallMs, vus, trailsSha, challengeSha] = process.argv.slice(2);
const num = (s) => (s === "" || s === undefined ? null : Number(s));
const summary = JSON.parse(await readFile(`${out}/k6-summary.json`, "utf8"));
const m = summary.metrics;
const reqs = m.http_reqs?.count ?? 0;
const dur = m.http_req_duration ?? {};
const usage = num(after) !== null && num(before) !== null ? num(after) - num(before) : null;

const gcFiles = (await readdir(`${out}/prof`)).filter((f) => f.startsWith("gc-"));
const gc = [];
for (const f of gcFiles) gc.push(...JSON.parse(await readFile(`${out}/prof/${f}`, "utf8")));
const major = gc
  .filter(([, , kind]) => kind === 4 || kind === "major")
  .map(([, d]) => d)
  .sort((a, b) => a - b);
const gcMs = gc.reduce((s, [, d]) => s + d, 0);

const round = (x, p = 2) => (x === null || x === undefined ? null : +x.toFixed(p));
console.log(
  JSON.stringify({
    date: new Date().toISOString(),
    trails_sha: trailsSha,
    challenge_sha: challengeSha,
    runner: process.env.RUNNER_NAME ?? null,
    runner_os: process.env.ImageOS ?? null,
    cpu_model: cpus()[0]?.model ?? null,
    cpu_count: cpus().length,
    vus: Number(vus),
    http_reqs: reqs,
    req_per_s: round(m.http_reqs?.rate),
    cpu_us_per_req: usage !== null && reqs > 0 ? round(usage / reqs) : null,
    p50_ms: round(dur.med),
    p95_ms: round(dur["p(95)"]),
    p99_ms: round(dur["p(99)"]),
    error_rate: round(m.http_req_failed?.value ?? m.http_req_failed?.rate, 5),
    peak_rss_bytes: num(peak),
    wall_ms: Number(wallMs),
    gc_count: gc.length,
    gc_busy_pct: usage ? round((gcMs * 1000 * 100) / usage) : null,
    major_gc_max_ms: major.length ? major.at(-1) : null,
    major_gc_p50_ms: major.length ? major[Math.floor(major.length / 2)] : null,
  }),
);
