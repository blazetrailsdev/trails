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
import { Topic } from "../test-helpers/models/topic.js";

const CASES: [string, string][] = [
  ["::Alpha", "::Alpha"],
  [":Alpha", ":Alpha"],
  [":::Alpha", ":::Alpha"],
  ["Alpha::Beta", "Alpha::Beta"],
];

/**
 * Diagnostics for the intermittent failure tracked by
 * `leading-colon-insert-all-first-returns-null-flake` (RFC 0061): the row
 * `insert_all` just wrote is occasionally not found by the very next read, seen
 * on SQLite and MariaDB and only ever inside a full-suite run. The cheap
 * explanations are eliminated (a stale query cache — the cache is never enabled
 * in the AR lanes; a silently skipped `ON CONFLICT DO NOTHING` — the only unique
 * constraint is the PK and the id counters self-adjust), so the next sighting
 * has to bring data out of the failing process itself.
 *
 * This runs ONLY once the read has already come back empty, and reports rather
 * than repairs — it exists to turn a bare "Cannot read properties of null" into
 * an error that says which of the remaining hypotheses is true:
 *
 *   - `returning` empty        → the INSERT itself wrote no row.
 *   - `returning` non-empty but the row is absent from `topics` → something
 *     removed it between the two statements.
 *   - the row present in `topics` but not returned by the read → the read is at
 *     fault (wrong connection, or an uncommitted transaction on another one).
 */
async function missingRowDiagnostics(
  iteration: number,
  sent: string,
  returning: unknown,
): Promise<string> {
  const connection = (await Topic.leaseConnection()) as unknown as {
    execQuery(sql: string): Promise<{ rows: unknown[][] }>;
    openTransactions: number;
  };
  const all = await connection.execQuery(
    'SELECT "id", "title", "author_name" FROM "topics" ORDER BY "id"',
  );
  return [
    `insert_all wrote a row that the next read did not find.`,
    `  iteration:        ${iteration} (sent ${JSON.stringify(sent)})`,
    `  returning:        ${JSON.stringify(returning)}`,
    `  openTransactions: ${connection.openTransactions}`,
    `  topics rows:      ${JSON.stringify(all.rows)}`,
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

      const returning = await Topic.insertAll([{ title: sent, author_name: "colon" }]);
      const inserted = await Topic.where({ author_name: "colon" }).first();
      if (inserted == null) {
        throw new Error(await missingRowDiagnostics(iteration, sent, returning.rows));
      }
      expect(inserted.title).toBe(stored);
      await Topic.where({ author_name: "colon" }).deleteAll();
    }
  });
});
