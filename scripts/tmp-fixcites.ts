import * as fs from "fs";
import * as path from "path";

const ROOTS = [
  "vendor/rails/activerecord/lib",
  "vendor/rails/activemodel/lib",
  "vendor/rails/activesupport/lib",
  "vendor/rails/activerecord/test",
];
function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".rb")) out.push(p);
  }
  return out;
}
const ALL = ROOTS.flatMap((r) => (fs.existsSync(r) ? walk(r) : []));
function resolveRb(rel: string): string | undefined {
  return ALL.filter((p) => p.endsWith("/" + rel)).sort((a, b) => a.length - b.length)[0];
}

/** Candidate ruby symbols named in a receipt, most specific first. */
function symbols(reason: string): string[] {
  const out: string[] = [];
  for (const m of reason.matchAll(/[A-Z][A-Za-z:]*[#.]([a-z_][a-z0-9_]*[?!]?)/g)) out.push(m[1]);
  for (const m of reason.matchAll(/`([a-z_][a-z0-9_]*[?!]?)[`:(]/g)) out.push(m[1]);
  for (const m of reason.matchAll(/\b([a-z_][a-z0-9_]{3,}[?!]?)\b/g)) {
    if (m[1].includes("_") || m[1].endsWith("?") || m[1].endsWith("!")) out.push(m[1]);
  }
  return [...new Set(out)];
}

function findLine(rbPath: string, sym: string): number | undefined {
  const lines = fs.readFileSync(rbPath, "utf8").split("\n");
  const esc = sym.replace(/[?!]/g, (c) => "\\" + c);
  const pats = [
    new RegExp(`^\\s*def\\s+self\\.${esc}\\b`),
    new RegExp(`^\\s*def\\s+${esc}\\b`),
    new RegExp(`^\\s*alias(_method)?\\s+:?${esc}\\b`),
    new RegExp(`^\\s*${esc}:\\s`),
    new RegExp(`^\\s*(class|module)\\s+${esc}\\b`),
    new RegExp(`^\\s*${esc}\\s*=`),
  ];
  for (const p of pats) {
    const i = lines.findIndex((l) => p.test(l));
    if (i >= 0) return i + 1;
  }
  return undefined;
}

const files: string[] = [];
(function walkTs(dir: string) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkTs(p);
    else if (e.name.endsWith(".ts")) files.push(p);
  }
})("packages/activerecord/src");
(function walkTs2(dir: string) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkTs2(p);
    else if (e.name.endsWith(".ts")) files.push(p);
  }
})("packages/arel/src");

const rows: string[] = [];
for (const f of files) {
  const lines = fs.readFileSync(f, "utf8").split("\n");
  lines.forEach((l, i) => {
    if (!l.includes("@noRailsEquivalent")) return;
    const m = /([a-z0-9_/]+\.rb):(\d+)/.exec(l);
    if (!m) return;
    const rb = resolveRb(m[1]);
    const reason = l.replace(/^\s*\*?\s*@noRailsEquivalent\s*/, "");
    if (!rb) {
      rows.push([f, String(i + 1), m[1] + ":" + m[2], "UNRESOLVED", "", reason].join("\t"));
      return;
    }
    const cur = (fs.readFileSync(rb, "utf8").split("\n")[+m[2] - 1] ?? "").trim();
    let proposed = "";
    let sym = "";
    for (const s of symbols(reason)) {
      const ln = findLine(rb, s);
      if (ln !== undefined) { proposed = String(ln); sym = s; break; }
    }
    rows.push([f, String(i + 1), m[1] + ":" + m[2], cur.slice(0, 60), sym + "@" + proposed, reason.slice(0, 110)].join("\t"));
  });
}
fs.writeFileSync(process.argv[2], rows.join("\n"));
console.log(rows.length);
