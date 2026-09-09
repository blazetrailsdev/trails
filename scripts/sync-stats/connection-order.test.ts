import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = fileURLToPath(new URL(".", import.meta.url));

// A model's `static {}` block calls `attribute(name, "type")`, which resolves a
// Symbol type eagerly via `Type.adapter_name_from(self)` ->
// `connection_db_config` (activerecord/lib/active_record/attributes.rb:297,
// type.rb:49-51) and raises without a pool. A model defined above the
// connection therefore kills the whole sync at module load, not one query.
describe("sync-stats connection order", () => {
  it("establishes the connection before the first model class is defined", async () => {
    const source = await readFile(`${dir}sync.ts`, "utf8");

    const establishedAt = source.indexOf("await Base.establishConnection(");
    const firstModelAt = source.search(/^class \w+ extends Base \{$/m);

    expect(establishedAt).toBeGreaterThan(-1);
    expect(firstModelAt).toBeGreaterThan(-1);
    expect(establishedAt).toBeLessThan(firstModelAt);
  });
});
