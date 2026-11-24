import { Base } from "@blazetrails/activerecord";
import { TopLevel, constSet } from "@blazetrails/ruby-compat";
import Database from "better-sqlite3";
import { Base as SpikeBase } from "./record-spike/index.js";

const ROWS = 12_000;
const COLUMNS = 24;
const RUNS = 5;
const NAMES = Array.from({ length: COLUMNS }, (_, i) => `c${i}`);

const CREATE = `CREATE TABLE stories (id INTEGER PRIMARY KEY, ${NAMES.map((name, i) =>
  i % 3 === 0 ? `${name} INTEGER` : i % 3 === 1 ? `${name} TEXT` : `${name} DATETIME`,
).join(", ")})`;
const SEED =
  `WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < ${ROWS}) ` +
  `INSERT INTO stories SELECT x, ${NAMES.map((_, i) =>
    i % 3 === 0 ? String(i) : i % 3 === 1 ? `'text ${i}'` : `'2026-10-12 12:00:00'`,
  ).join(", ")} FROM n`;
const RESET = `DELETE FROM stories WHERE id > ${ROWS}`;
const WRITTEN = { c0: 7, c1: "written", c2: "2026-10-12 12:00:00" };

class Story extends Base {
  static {
    this.tableName = "stories";
    this.belongsTo("parent", { className: "Story", foreignKey: "c3" });
  }
}
constSet(TopLevel, "Story", Story);

class SpikeStory extends SpikeBase {
  static {
    this.tableName = "stories";
    this.belongsTo("parent", { className: "SpikeStory", foreignKey: "c3" });
  }
}

type Row = Record<string, unknown>;

function asRows(records: Promise<object[]>): Promise<Row[]> {
  return records as Promise<Row[]>;
}

interface Side {
  load(): Promise<Row[]>;
  loadWithParent(): Promise<Row[]>;
  parent(row: Row): unknown;
  find(id: number): Promise<unknown>;
  insert(): Promise<unknown[]>;
  update(written: unknown[]): Promise<void>;
  reset(): Promise<void>;
  pluck?(): Promise<unknown>;
}

function driverSide(): Side {
  const db = new Database(":memory:");
  db.exec(CREATE);
  db.exec(SEED);
  const all = db.prepare("SELECT * FROM stories");
  const get = db.prepare("SELECT * FROM stories WHERE id = ?");
  const insert = db.prepare("INSERT INTO stories (c0, c1, c2) VALUES (?, ?, ?) RETURNING id");
  const update = db.prepare("UPDATE stories SET c1 = ? WHERE id = ?");
  return {
    load: async () => all.all() as Row[],
    async loadWithParent() {
      const rows = all.all() as Row[];
      const parent = get.get(rows[0].c3);
      for (const row of rows) row.parent = parent;
      return rows;
    },
    parent: (row) => get.get(row.c3),
    find: async (id) => get.get(id),
    async insert() {
      db.exec("BEGIN");
      const ids: unknown[] = [];
      for (let i = 0; i < ROWS; i++) {
        ids.push((insert.get(WRITTEN.c0, WRITTEN.c1, WRITTEN.c2) as { id: number }).id);
      }
      db.exec("COMMIT");
      return ids;
    },
    async update(ids) {
      db.exec("BEGIN");
      for (const id of ids) update.run("changed", id);
      db.exec("COMMIT");
    },
    reset: async () => void db.exec(RESET),
  };
}

async function spikeSide(): Promise<Side> {
  await SpikeBase.establishConnection({ adapter: "sqlite3", database: ":memory:" });
  const db = SpikeBase.connection.raw;
  db.exec(CREATE);
  db.exec(SEED);
  await SpikeStory.loadSchema();
  return {
    load: () => asRows(SpikeStory.all().toArray()),
    loadWithParent: () => asRows(SpikeStory.includes("parent").toArray()),
    parent: (row) => row.parent,
    find: (id) => SpikeStory.find(id),
    async insert() {
      db.exec("BEGIN");
      const records: SpikeStory[] = [];
      for (let i = 0; i < ROWS; i++) records.push(await SpikeStory.create(WRITTEN));
      db.exec("COMMIT");
      return records;
    },
    async update(records) {
      db.exec("BEGIN");
      for (const record of records as SpikeStory[]) await record.update({ c1: "changed" });
      db.exec("COMMIT");
    },
    reset: async () => void db.exec(RESET),
  };
}

async function activeRecordSide(): Promise<Side> {
  await Base.establishConnection({ adapter: "sqlite3", database: ":memory:" });
  const conn = await Base.leaseConnection();
  await conn.execute(CREATE);
  await conn.execute(SEED);
  await Story.loadSchema();
  await Story.first();
  return {
    load: () => asRows(Story.all().toArray()),
    loadWithParent: () => asRows(Story.includes("parent").toArray()),
    parent: (row) => row.parent,
    find: (id) => Story.find(id),
    async insert() {
      const records: Story[] = [];
      await Base.transaction(async () => {
        for (let i = 0; i < ROWS; i++) records.push(await Story.create(WRITTEN));
      });
      return records;
    },
    async update(records) {
      await Base.transaction(async () => {
        for (const record of records as Story[]) await record.update({ c1: "changed" });
      });
    },
    reset: async () => void (await conn.execute(RESET)),
    pluck: () => Story.pluck(...NAMES),
  };
}

async function time(body: () => Promise<unknown>): Promise<number> {
  const start = performance.now();
  await body();
  return performance.now() - start;
}

async function measure(side: Side): Promise<Record<string, number>> {
  const samples: Record<string, number[]> = {};
  const record = (name: string, ms: number): void => void (samples[name] ??= []).push(ms);
  for (let run = 0; run <= RUNS; run++) {
    let rows: Row[] = [];
    const load = await time(async () => void (rows = await side.load()));
    const read = await time(async () => {
      for (const row of rows) for (const name of NAMES) void row[name];
    });
    const find = await time(async () => {
      for (let id = 1; id <= ROWS; id++) await side.find(id);
    });
    const lazy = await time(async () => {
      for (const row of rows) await side.parent(row);
    });
    const preload = await time(async () => {
      for (const row of await side.loadWithParent()) void row.parent;
    });
    let written: unknown[] = [];
    const insert = await time(async () => void (written = await side.insert()));
    const update = await time(() => side.update(written));
    await side.reset();
    const pluck = side.pluck ? await time(side.pluck) : null;
    if (run === 0) continue;
    record("load", load);
    record("load, then read every column", load + read);
    record("find by id", find);
    record("belongsTo, unloaded", lazy);
    record("load with belongsTo preloaded", preload);
    record("insert", insert);
    record("update one column", update);
    if (pluck !== null) record("pluck every column", pluck);
  }
  const medians: Record<string, number> = {};
  for (const [name, values] of Object.entries(samples)) {
    values.sort((a, b) => a - b);
    medians[name] = (values[Math.floor(values.length / 2)] * 1000) / ROWS;
  }
  return medians;
}

async function retained(side: Side): Promise<number | null> {
  const collect = (globalThis as { gc?: () => void }).gc;
  if (collect === undefined) return null;
  collect();
  const before = process.memoryUsage().heapUsed;
  const rows = await side.load();
  collect();
  const bytes = (process.memoryUsage().heapUsed - before) / rows.length;
  return rows.length === ROWS ? bytes : null;
}

function cell(value: number | null | undefined, digits: number): string {
  return (value == null ? "-" : value.toFixed(digits)).padStart(14);
}

async function main(): Promise<void> {
  const sides: Record<string, Side> = {
    driver: driverSide(),
    spike: await spikeSide(),
    activerecord: await activeRecordSide(),
  };
  const results: Record<string, Record<string, number | null>> = {};
  for (const [name, side] of Object.entries(sides)) {
    results[name] = { ...(await measure(side)), "heap retained": await retained(side) };
  }

  const { driver, spike, activerecord } = results;
  console.log(
    `node ${process.version}, ${ROWS} rows x ${COLUMNS} columns, in-memory SQLite, ` +
      `median of ${RUNS} runs`,
  );
  console.log(
    `${"µs per row".padEnd(30)}${[
      "driver",
      "spike",
      "activerecord",
      "spike/driver",
      "ar/driver",
      "ar/spike",
    ]
      .map((heading) => heading.padStart(14))
      .join("")}`,
  );
  for (const name of Object.keys(activerecord)) {
    const [d, s, a] = [driver[name], spike[name], activerecord[name]];
    const ratio = (x: number | null | undefined, y: number | null | undefined): string =>
      cell(x != null && y != null ? x / y : null, 1);
    const label = name === "heap retained" ? "heap bytes retained per row" : name;
    console.log(
      `${label.padEnd(30)}${cell(d, 2)}${cell(s, 2)}${cell(a, 2)}${ratio(s, d)}${ratio(a, d)}${ratio(a, s)}`,
    );
  }
  if (activerecord["heap retained"] === null) {
    console.log("heap retained needs --expose-gc");
  }
}

await main();
