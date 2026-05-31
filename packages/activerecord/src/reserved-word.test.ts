import { describe, it, expect, beforeAll } from "vitest";
import { Base } from "./index.js";
import "./relation.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";
import { useFixtures } from "./test-helpers/use-fixtures.js";
import { TEST_SCHEMA } from "./test-helpers/test-schema.js";
import { reservedWordsGroupFixtureData } from "./test-helpers/fixtures/reserved-words/group.js";

class Group extends Base {
  static tableName = "group";
}
class Select extends Base {
  static tableName = "select";
}
class Values extends Base {
  static tableName = "values";
  static primaryKey = "as";
}
class Distinct extends Base {
  static tableName = "distinct";
}

setupHandlerSuite();
useHandlerTransactionalFixtures();
beforeAll(async () => {
  await defineSchema({
    group: TEST_SCHEMA.group,
    select: TEST_SCHEMA.select,
    distinct: TEST_SCHEMA.distinct,
    distinct_select: TEST_SCHEMA.distinct_select,
    values: TEST_SCHEMA.values,
  });
  await Promise.all([
    Group.loadSchema(),
    Select.loadSchema(),
    Values.loadSchema(),
    Distinct.loadSchema(),
  ]);
});

const { groups } = useFixtures(
  { groups: [Group, reservedWordsGroupFixtureData] },
  () => Base.connection,
);

describe("ReservedWordTest", () => {
  it.skip("create tables", () => {
    // BLOCKED: schema — schema introspection / dumper gap in reserved-word
    // ROOT-CAUSE: reserved-word.ts or abstract/schema-statements.ts missing Rails parity
    // SCOPE: ~50–200 LOC fix in schema-dumper.ts or schema-statements.ts; affects ~7–43 tests in reserved-word.test.ts
  });
  it.skip("rename tables", () => {
    // BLOCKED: schema — schema introspection / dumper gap in reserved-word
    // ROOT-CAUSE: reserved-word.ts or abstract/schema-statements.ts missing Rails parity
    // SCOPE: ~50–200 LOC fix in schema-dumper.ts or schema-statements.ts; affects ~7–43 tests in reserved-word.test.ts
  });
  it.skip("change columns", () => {
    // BLOCKED: schema — schema introspection / dumper gap in reserved-word
    // ROOT-CAUSE: reserved-word.ts or abstract/schema-statements.ts missing Rails parity
    // SCOPE: ~50–200 LOC fix in schema-dumper.ts or schema-statements.ts; affects ~7–43 tests in reserved-word.test.ts
  });
  it.skip("introspect", () => {
    // BLOCKED: schema — schema introspection / dumper gap in reserved-word
    // ROOT-CAUSE: reserved-word.ts or abstract/schema-statements.ts missing Rails parity
    // SCOPE: ~50–200 LOC fix in schema-dumper.ts or schema-statements.ts; affects ~7–43 tests in reserved-word.test.ts
  });

  it("activerecord model", async () => {
    const x = new Group();
    x.writeAttribute("order", "order_val_a");
    await x.save();
    x.writeAttribute("order", "order_val_b");
    await x.save();
    const found = await Group.findBy({ order: "order_val_b" });
    expect(found).not.toBeNull();
    expect(found!.id).toBe(x.id);
  });

  it.skip("delete all with subselect", () => {
    // BLOCKED: schema — schema introspection / dumper gap in reserved-word
    // ROOT-CAUSE: reserved-word.ts or abstract/schema-statements.ts missing Rails parity
    // SCOPE: ~50–200 LOC fix in schema-dumper.ts or schema-statements.ts; affects ~7–43 tests in reserved-word.test.ts
  });
  it.skip("has one associations", () => {
    // BLOCKED: schema — schema introspection / dumper gap in reserved-word
    // ROOT-CAUSE: reserved-word.ts or abstract/schema-statements.ts missing Rails parity
    // SCOPE: ~50–200 LOC fix in schema-dumper.ts or schema-statements.ts; affects ~7–43 tests in reserved-word.test.ts
  });
  it.skip("belongs to associations", () => {
    // BLOCKED: schema — schema introspection / dumper gap in reserved-word
    // ROOT-CAUSE: reserved-word.ts or abstract/schema-statements.ts missing Rails parity
    // SCOPE: ~50–200 LOC fix in schema-dumper.ts or schema-statements.ts; affects ~7–43 tests in reserved-word.test.ts
  });

  it("activerecord introspection", async () => {
    expect(await Group.tableExists()).toBe(true);
    const cols = Group.columns()
      .map((c: { name: string }) => c.name)
      .sort();
    expect(cols).toEqual(["id", "order", "select_id"]);
  });

  it("calculations work with reserved words", async () => {
    expect(await Group.count()).toBe(3);
  });

  it.skip("associations work with reserved words", () => {
    // BLOCKED: schema — schema introspection / dumper gap in reserved-word
    // ROOT-CAUSE: reserved-word.ts or abstract/schema-statements.ts missing Rails parity
    // SCOPE: ~50–200 LOC fix in schema-dumper.ts or schema-statements.ts; affects ~7–43 tests in reserved-word.test.ts
  });
});
