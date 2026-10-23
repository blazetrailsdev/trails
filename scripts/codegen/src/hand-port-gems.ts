/**
 * Tests that need a gem trails does not port (`GemConfig.handPortGems`): the
 * setup naming it is dropped from the test files, and the examples reaching it
 * are found so emit.ts can skip them for a hand port.
 */
import { GEM } from "./gem.js";
import { walk, type IrFile, type N } from "./ir.js";

const owner = new Map<string, string>();
for (const [gem, consts] of Object.entries(GEM.handPortGems ?? {}))
  for (const c of consts) owner.set(c, gem);

/** Test helper methods (`def require_chronic`) whose bodies reach such a gem. */
const helpers = new Map<string, string>();

/** The hand-port gem `n` names: a constant, or a Symbol / String spelling one (`remove_const(:Chronic)`). */
function names(n: N): string | null {
  let hit: string | null = null;
  walk(n, (x) => {
    if (hit) return false;
    if (x.k === "const") hit = owner.get(x.path.filter((p: string) => p).at(-1)) ?? null;
    else if ((x.k === "sym" || x.k === "str") && typeof x.value === "string")
      hit = owner.get(x.value) ?? null;
    else if (x.k === "call" && x.recv === null && x.name === "require" && x.args[0]?.k === "str")
      hit = GEM.handPortGems?.[x.args[0].value] ? x.args[0].value : null;
  });
  return hit;
}

/** The gem an example body reaches, directly or through a helper. */
export function handPortGem(body: N | N[]): string | null {
  let hit: string | null = null;
  walk(body, (x) => {
    if (hit) return false;
    hit = names(x) ?? (x.k === "call" && x.recv === null ? (helpers.get(x.name) ?? null) : null);
  });
  return hit;
}

/** Drop the test files' top-level setup naming a hand-port gem; note the helpers that reach one. */
export function stripHandPortSetup(files: IrFile[]): void {
  if (!owner.size) return;
  for (const f of files) {
    if (!f.file.startsWith("test/")) continue;
    walk(f.body, (x) => {
      if (x.k === "def") {
        const g = names(x.body);
        if (g) helpers.set(x.name, g);
      }
    });
    const keep = (s: N) =>
      s.k === "def" || s.k === "class" || s.k === "module" || !!s.block || !names(s);
    if (f.body?.k === "seq") f.body.body = f.body.body.filter(keep);
  }
}
