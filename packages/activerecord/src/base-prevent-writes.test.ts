import { describe, it, expect, beforeAll } from "vitest";

import { Base } from "./index.js";
import { ReadOnlyError } from "./errors.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { TEST_SCHEMA } from "./test-helpers/test-schema.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";

describe("BasePreventWritesTest", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();

  class Bird extends Base {
    static {
      this.attribute("name", "string");
    }
  }

  beforeAll(async () => {
    await defineSchema({ birds: TEST_SCHEMA.birds }, { dropExisting: true });
  });

  it("creating a record raises if preventing writes", async () => {
    await expect(
      Base.whilePreventingWrites(async () => {
        await Bird.create({ name: "Bluejay" });
      }),
    ).rejects.toThrow(ReadOnlyError);
  });

  it("updating a record raises if preventing writes", async () => {
    const bird = await Bird.create({ name: "Robin" });
    await expect(
      Base.whilePreventingWrites(async () => {
        await bird.update({ name: "Mockingbird" });
      }),
    ).rejects.toThrow(ReadOnlyError);
  });

  it("deleting a record raises if preventing writes", async () => {
    const bird = await Bird.create({ name: "Sparrow" });
    await expect(
      Base.whilePreventingWrites(async () => {
        await bird.destroy();
      }),
    ).rejects.toThrow(ReadOnlyError);
  });

  it("selecting a record does not raise if preventing writes", async () => {
    await Bird.create({ name: "Eagle" });
    await Base.whilePreventingWrites(async () => {
      await Bird.first();
    });
  });

  it("an explain query does not raise if preventing writes", async () => {
    await Base.whilePreventingWrites(async () => {
      await Bird.all().explain();
    });
  });

  it("an empty transaction does not raise if preventing writes", async () => {
    await Base.whilePreventingWrites(async () => {
      await Bird.transaction(async () => {});
    });
  });

  it.skip("preventing writes applies to all connections in block", () => {
    // Requires two separate connection pools — cannot verify with single-pool SQLite.
  });

  it("current_preventing_writes", () => {
    expect(Base.currentPreventingWrites()).toBe(false);
    Base.whilePreventingWrites(() => {
      expect(Base.currentPreventingWrites()).toBe(true);
    });
    expect(Base.currentPreventingWrites()).toBe(false);
  });
});
