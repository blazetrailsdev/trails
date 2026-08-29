import { describe, it, expect } from "vitest";
import { Base } from "./index.js";

import { fixtures } from "./test-fixtures.js";

describe("lazy async schema reflection", () => {
  fixtures([]);

  it("find_by without an explicit load_schema", async () => {
    class Topic extends Base {
      static override tableName = "topics";
    }

    const created = await Topic.create({ title: "Lazy" });
    expect(created.isPersisted()).toBe(true);

    const found = await Topic.findBy({ title: "Lazy" });
    expect(found).not.toBeNull();
    expect((found as unknown as { title: string }).title).toBe("Lazy");
  });

  it("find without an explicit load_schema", async () => {
    class Topic extends Base {
      static override tableName = "topics";
    }

    const created = await Topic.create({ title: "Found" });
    const found = await Topic.find(created.id);
    expect((found as unknown as { title: string }).title).toBe("Found");
  });
});
