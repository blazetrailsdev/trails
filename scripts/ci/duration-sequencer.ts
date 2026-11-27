import { readFile } from "node:fs/promises";
import { relative } from "node:path";
import { BaseSequencer, type TestSpecification } from "vitest/node";

// Per-file setup + collect + transform cost vitest reports outside a file's
// own duration: ~1.85s a file on the hosted AR lanes (run 44171118164).
const FILE_OVERHEAD_MS = 1800;

type Durations = Record<string, Record<string, number>>;

/** @noRailsEquivalent PERMANENT */
export async function loadDurations(): Promise<Record<string, number> | null> {
  const adapter = process.env.VITEST_SHARD_DURATIONS;
  if (!adapter) return null;
  const all = JSON.parse(
    await readFile(new URL("./ar-shard-durations.json", import.meta.url), "utf8"),
  ) as Durations;
  const table = all[adapter];
  if (!table) throw new Error(`ar-shard-durations.json has no "${adapter}" table`);
  return table;
}

/** @noRailsEquivalent PERMANENT */
export function specKey(root: string, spec: TestSpecification): string {
  return relative(root, spec.moduleId).split("\\").join("/");
}

/**
 * A file's weight: its recorded time, else the table's median, plus overhead.
 *
 * @noRailsEquivalent PERMANENT
 */
export function weigher(
  root: string,
  table: Record<string, number>,
): (spec: TestSpecification) => number {
  const known = Object.values(table).sort((a, b) => a - b);
  const median = known[Math.floor(known.length / 2)] ?? 0;
  return (spec) => {
    const key = specKey(root, spec);
    return (Object.hasOwn(table, key) ? table[key] : median) + FILE_OVERHEAD_MS;
  };
}

/**
 * Splits `--shard` by measured duration instead of file count. Engaged by
 * `VITEST_SHARD_DURATIONS=<adapter>` (a key of ar-shard-durations.json);
 * without it, the stock hash split. Every file lands in exactly one shard:
 * each shard computes the same greedy longest-first partition and keeps its
 * own bin. A file with no recorded time weighs the table's median.
 * `VITEST_SHARD_ONE_EXTRA_MS` preloads shard 1's bin, for a lane whose
 * shard 1 also runs the unsharded steps; it is in fork-summed ms, which run
 * ~2.8x wall-clock on the hosted lanes.
 *
 * @noRailsEquivalent PERMANENT
 */
export class DurationSequencer extends BaseSequencer {
  private table: Record<string, number> | null | undefined;

  private async durations(): Promise<Record<string, number> | null> {
    if (this.table !== undefined) return this.table;
    return (this.table = await loadDurations());
  }

  private weigher(table: Record<string, number>): (spec: TestSpecification) => number {
    return weigher(this.ctx.config.root, table);
  }

  override async shard(files: TestSpecification[]): Promise<TestSpecification[]> {
    const table = await this.durations();
    if (!table) return super.shard(files);
    const { index, count } = this.ctx.config.shard!;
    const weigh = this.weigher(table);
    const weighed = files
      .map((spec) => ({ spec, weight: weigh(spec), key: specKey(this.ctx.config.root, spec) }))
      .sort((a, b) => b.weight - a.weight || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    const loads = Array.from({ length: count }, (_, i) =>
      i === 0 ? Number(process.env.VITEST_SHARD_ONE_EXTRA_MS ?? 0) : 0,
    );
    const mine: TestSpecification[] = [];
    for (const { spec, weight } of weighed) {
      let bin = 0;
      for (let i = 1; i < count; i++) if (loads[i] < loads[bin]) bin = i;
      loads[bin] += weight;
      if (bin === index - 1) mine.push(spec);
    }
    return mine;
  }

  override async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    const table = await this.durations();
    if (!table) return super.sort(files);
    const weigh = this.weigher(table);
    return [...files].sort((a, b) => weigh(b) - weigh(a));
  }
}
