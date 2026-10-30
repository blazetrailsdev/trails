// Dumps the value exports of each trails dependency package as JSON.
// Run from packages/activerecord so the workspace packages resolve.
const out = {};
const newables = [];
for (const p of [
  "ruby-compat",
  "activesupport",
  "activemodel",
  "arel",
  "did-you-mean",
  "globalid",
  "date",
]) {
  const m = await import(`@blazetrails/${p}`);
  out[`@blazetrails/${p}`] = Object.keys(m).sort();
  // Exports ported as an object with its own `new` (Ruby `def self.new` on a
  // module, e.g. ActiveSupport::TaggedLogging): `X.new(...)`, not `new X(...)`.
  for (const [k, v] of Object.entries(m))
    if (v && typeof v === "object" && typeof v.new === "function") newables.push(k);
}
out["#newables"] = [...new Set(newables)].sort();
process.stdout.write(JSON.stringify(out));
