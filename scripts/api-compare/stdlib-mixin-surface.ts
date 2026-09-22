/**
 * Report-only (RFC 0156): the Ruby stdlib mixins a Rails class includes, and
 * whether its TS port answers their surface.
 *
 * `flattenIncludedMethodInfos` (compare.ts) skips a module outside the package,
 * so `include Enumerable` / `include Comparable` contribute no expected names
 * and `map`, `first`, block-form `any?` or `between?` are public Rails API that
 * nothing measures. `ActiveModel::Errors` is the case that surfaced it
 * (`activemodel/lib/active_model/errors.rb:41`).
 *
 * Expanding the mixins into one expected name per method would put ~50 rows
 * on every includer for what is one decision, so this is one row per class.
 * Constraints: no `node:` specifiers, no `process` references.
 */
import { rubyFileToTs } from "../parity/conventions.js";
import type { ApiManifest, ClassInfo } from "../parity/types.js";

/**
 * Each stdlib mixin this report reads, keyed by the Ruby module name, with the
 * method an includer must define for the mixin to work (Enumerable's
 * contract is `each`, Comparable's is `<=>`).
 */
export const STDLIB_MIXINS = {
  Enumerable: { contract: "each" },
  Comparable: { contract: "<=>" },
} as const;

export type StdlibMixin = keyof typeof STDLIB_MIXINS;

/**
 * The TS member that answers the Ruby contract without the mixin: a class with
 * `[Symbol.iterator]` is iterable (the `for...of` lowering of `each`), and
 * ruby-compat's `Comparable` spells `<=>` as `compareTo`
 * (`packages/ruby-compat/src/comparable.ts`).
 */
const TS_CONTRACT_MEMBER: Record<StdlibMixin, string> = {
  Enumerable: "[Symbol.iterator]",
  Comparable: "compareTo",
};

/**
 * Evidence the TS class mixes the ruby-compat module in. Enumerable arrives
 * through `include()` and is recorded as an edge; ruby-compat's Comparable is a
 * set of `this`-typed functions a class assigns to itself
 * (`time-with-zone.ts`, `date.ts`), so its derived operators are the evidence.
 */
function mixesIn(mixin: StdlibMixin, info: ClassInfo): boolean {
  if ([...info.includes, ...info.extends].includes(mixin)) return true;
  if (mixin !== "Comparable") return false;
  const names = new Set(info.instanceMethods.map((m) => m.name));
  return names.has("lessThan") && names.has("isBetween");
}

export interface StdlibMixinRow {
  package: string;
  rubyFqn: string;
  rubyFile: string;
  mixin: StdlibMixin;
  tsFile: string;
  /** Absent when no TS class of that name lives in the mirrored file. */
  tsClass?: string;
  /** The TS class answers the contract (`[Symbol.iterator]` / `compareTo`). */
  answersContract: boolean;
  /** The TS class mixes the ruby-compat module in. */
  mixesIn: boolean;
}

/** The last `::` segment: an `include ::Enumerable` still names Enumerable. */
function shortName(name: string): string {
  return name.split("::").pop() ?? name;
}

/**
 * One row per Ruby class or module that includes a {@link STDLIB_MIXINS} module
 * and defines its contract method, whatever the port does. A row is a gap
 * ({@link isStdlibMixinGap}) when the port does not mix the module in: an
 * iterable class answers `for...of` but still has no `map` / `first` / `any?`,
 * which is exactly where `ActiveModel::Errors` stands.
 *
 * TS classes and modules are concatenated, never spread-merged: a class and a
 * same-named namespace share one `file:Name` key across the two maps.
 */
export function stdlibMixinRows(
  ruby: ApiManifest,
  ts: ApiManifest,
  filterPkg?: string | null,
): StdlibMixinRow[] {
  const rows: StdlibMixinRow[] = [];
  for (const [pkg, rubyPkg] of Object.entries(ruby.packages)) {
    if (filterPkg && pkg !== filterPkg) continue;
    const tsEntities = [
      ...Object.values(ts.packages[pkg]?.classes ?? {}),
      ...Object.values(ts.packages[pkg]?.modules ?? {}),
    ];
    const entities = { ...rubyPkg.modules, ...rubyPkg.classes };
    for (const [fqn, info] of Object.entries(entities)) {
      if (!info.file) continue;
      const own = new Set(info.instanceMethods.map((m) => m.name));
      for (const inc of info.includes ?? []) {
        const mixin = shortName(inc);
        if (!Object.hasOwn(STDLIB_MIXINS, mixin)) continue;
        const key = mixin as StdlibMixin;
        if (!own.has(STDLIB_MIXINS[key].contract)) continue;
        const tsFile = rubyFileToTs(info.file, pkg);
        const tsInfos = tsEntities.filter((t) => t.file === tsFile && t.name === shortName(fqn));
        rows.push({
          package: pkg,
          rubyFqn: fqn,
          rubyFile: info.file,
          mixin: key,
          tsFile,
          ...(tsInfos.length > 0 ? { tsClass: tsInfos[0].name } : {}),
          answersContract: tsInfos.some((t) =>
            t.instanceMethods.some((m) => m.name === TS_CONTRACT_MEMBER[key]),
          ),
          mixesIn: tsInfos.some((t) => mixesIn(key, t)),
        });
      }
    }
  }
  return rows.sort(
    (a, b) => a.package.localeCompare(b.package) || a.rubyFqn.localeCompare(b.rubyFqn),
  );
}

export function isStdlibMixinGap(row: StdlibMixinRow): boolean {
  return !row.mixesIn;
}
