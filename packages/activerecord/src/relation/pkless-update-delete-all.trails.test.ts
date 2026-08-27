import { describe, it, expect } from "vitest";
import { fixtures } from "../test-fixtures.js";
import { Edge } from "../test-helpers/models/edge.js";

fixtures({});

describe("update_all / delete_all on a model without a primary key", () => {
  it("update_all updates the matching rows", async () => {
    await Edge.create({ source_id: 901, sink_id: 902 });
    await Edge.create({ source_id: 903, sink_id: 904 });

    const updated = await Edge.where({ source_id: 901 }).updateAll({ sink_id: 999 });
    expect(updated).toBe(1);
    expect(await Edge.where({ source_id: 901, sink_id: 999 }).count()).toBe(1);

    await Edge.where({ source_id: [901, 903] }).deleteAll();
  });

  it("delete_all deletes the matching rows", async () => {
    await Edge.create({ source_id: 911, sink_id: 912 });
    await Edge.create({ source_id: 913, sink_id: 914 });

    const deleted = await Edge.where({ source_id: 911 }).deleteAll();
    expect(deleted).toBe(1);
    expect(await Edge.where({ source_id: 911 }).count()).toBe(0);
    expect(await Edge.where({ source_id: 913 }).count()).toBe(1);

    await Edge.where({ source_id: 913 }).deleteAll();
  });
});
