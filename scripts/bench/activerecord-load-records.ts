// Run: npx tsx scripts/bench/activerecord-load-records.ts (after `pnpm build`). The
// `Story.first()` warm-up keeps the first query's one-time module loading out of the timed loads.
import { Base } from "@blazetrails/activerecord";

const ROWS = 12_000;
const COLUMNS = 24;

class Story extends Base {
  static {
    this.tableName = "stories";
  }
}

async function main(): Promise<void> {
  await Base.establishConnection({ adapter: "sqlite3", database: ":memory:" });
  const columns = Array.from({ length: COLUMNS }, (_, i) =>
    i % 3 === 0 ? `c${i} INTEGER` : i % 3 === 1 ? `c${i} TEXT` : `c${i} DATETIME`,
  );
  const conn = await Base.leaseConnection();
  await conn.execute(`CREATE TABLE stories (id INTEGER PRIMARY KEY, ${columns.join(", ")})`);
  const values = Array.from({ length: COLUMNS }, (_, i) =>
    i % 3 === 0 ? String(i) : i % 3 === 1 ? `'text ${i}'` : `'2026-10-12 12:00:00'`,
  );
  await conn.execute(
    `WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < ${ROWS}) ` +
      `INSERT INTO stories SELECT x, ${values.join(", ")} FROM n`,
  );
  await Story.loadSchema();
  await Story.first();

  for (let run = 0; run < 5; run++) {
    let t = performance.now();
    const records = await Story.all().toArray();
    const load = performance.now() - t;
    t = performance.now();
    await Story.pluck(...Array.from({ length: COLUMNS }, (_, i) => `c${i}`));
    const pluck = performance.now() - t;
    console.log(
      `load ${records.length} rows: ${load.toFixed(0)}ms (${((load * 1000) / records.length).toFixed(1)}µs/record); ` +
        `pluck: ${pluck.toFixed(0)}ms`,
    );
  }
}

await main();
