/**
 * TS-only regression coverage: a string whose first character is a colon must
 * round-trip verbatim through every write path, before and after the model's
 * attribute types are loaded.
 *
 * `ActiveModel::Type::ImmutableString#serialize`
 * (activemodel/lib/active_model/type/immutable_string.rb:52-58) routes
 * `::Symbol` through `to_s`. A trails Symbol is a `":name"` string, so keying
 * that arm off a leading colon made it fire on ordinary String data too and
 * ate one colon per write — but only once `type_for_attribute` had a real
 * string type to serialize through, which is why the `find_by` below comes
 * first.
 */
import { describe, it, expect } from "vitest";
import { fixtures } from "../test-fixtures.js";
import { withConnection } from "../connection-handling.js";
import { Topic } from "../test-helpers/models/topic.js";

const CASES: [string, string][] = [
  ["::Alpha", "::Alpha"],
  [":Alpha", ":Alpha"],
  [":::Alpha", ":::Alpha"],
  ["Alpha::Beta", "Alpha::Beta"],
];

/**
 * Reports why the row `insert_all` just wrote was not found by the next read —
 * the intermittent failure tracked by
 * `leading-colon-insert-all-first-returns-null-flake` (RFC 0061), which has only
 * ever reproduced inside a full-suite run. Runs on the already-failing path
 * only. An empty `returning` means the INSERT wrote no row; a non-empty one with
 * the row absent from `topics` means something removed it in between; the row
 * present but unread means the read is at fault.
 *
 * The read runs on the test's own pinned connection, not a fresh checkout:
 * `leaseConnection` routes through `checkout`, which resolves the pool's
 * pool-scoped fixture pin ahead of everything else (`connection-pool.ts:883`,
 * `:1542`). `openTransactions` is reported partly as a check on that — a `0`
 * beside an empty table would mean this read went somewhere else.
 */
async function missingRowDiagnostics(
  iteration: number,
  sent: string,
  returning: unknown,
  writeConnection: unknown,
): Promise<string> {
  const connection = await Topic.leaseConnection();
  const id = connection.quoteColumnName("id");
  const columns = [
    id,
    connection.quoteColumnName("title"),
    connection.quoteColumnName("author_name"),
  ];
  const all = await connection.execQuery(
    `SELECT ${columns.join(", ")} FROM ${connection.quoteTableName("topics")} ORDER BY ${id}`,
  );
  let probe: string;
  try {
    const row = await Topic.create({ title: "__pk probe" });
    probe = `inserted id ${String(row.id)}`;
  } catch (error) {
    probe = `raised ${error instanceof Error ? error.message : String(error)}`;
  }
  const sameConnection = writeConnection === connection;
  const rowsViaWriteLease = await withConnection.call(Topic as never, async (c: unknown) => {
    const conn = c as typeof connection;
    const result = await conn.execQuery(
      `SELECT ${id} FROM ${conn.quoteTableName("topics")} ` +
        `WHERE ${conn.quoteColumnName("author_name")} = 'colon'`,
    );
    return result.rows;
  });
  return [
    `insert_all wrote a row that the next read did not find.`,
    `  iteration:        ${iteration} (sent ${JSON.stringify(sent)})`,
    `  returning:        ${JSON.stringify(returning)}`,
    `  openTransactions: ${connection.openTransactions}`,
    `  topics rows:      ${JSON.stringify(all.rows)}`,
    `  next insert:      ${probe}`,
    `  same connection:  ${String(sameConnection)}`,
    `  colon rows via write lease: ${JSON.stringify(rowsViaWriteLease)}`,
  ].join("\n");
}

describe("leading-colon string writes", () => {
  fixtures({ topics: [Topic, {}] });

  it("update_all stores a leading colon verbatim once the types are loaded", async () => {
    const topic = await Topic.create({ title: "seed" });
    await Topic.findBy({ id: topic.id });
    for (const [sent, stored] of CASES) {
      await Topic.where({ id: topic.id }).updateAll({ title: sent });
      expect((await Topic.find(topic.id)).title).toBe(stored);
    }
  });

  it("save stores a leading colon verbatim once the types are loaded", async () => {
    const seed = await Topic.create({ title: "seed" });
    await Topic.findBy({ id: seed.id });
    for (const [sent, stored] of CASES) {
      const topic = await Topic.find(seed.id);
      topic.title = sent;
      await topic.save();
      expect((await Topic.find(seed.id)).title).toBe(stored);
    }
  });

  it("create and insert_all store a leading colon verbatim", async () => {
    await Topic.create({ title: "seed" });
    for (const [iteration, [sent, stored]] of CASES.entries()) {
      const created = await Topic.create({ title: sent });
      expect((await Topic.find(created.id)).title).toBe(stored);

      const writeConnection = await withConnection.call(Topic as never, (c: unknown) => c);
      const returning = await Topic.insertAll([{ title: sent, author_name: "colon" }]);
      const inserted = await Topic.where({ author_name: "colon" }).first();
      if (inserted == null) {
        throw new Error(
          await missingRowDiagnostics(iteration, sent, returning.rows, writeConnection),
        );
      }
      expect(inserted.title).toBe(stored);
      await Topic.where({ author_name: "colon" }).deleteAll();
    }
  });
});
