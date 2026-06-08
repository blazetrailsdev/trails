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
    const error = await Base.whilePreventingWrites(async () => {
      await Bird.create({ name: "Bluejay" });
    }).catch((e) => e);
    expect(error).toBeInstanceOf(ReadOnlyError);
    expect((error as ReadOnlyError).message).toMatch(
      /^Write query attempted while in readonly mode: INSERT /,
    );
  });

  it("updating a record raises if preventing writes", async () => {
    const bird = await Bird.create({ name: "Bluejay" });
    const error = await Base.whilePreventingWrites(async () => {
      await bird.update({ name: "Robin" });
    }).catch((e) => e);
    expect(error).toBeInstanceOf(ReadOnlyError);
    expect((error as ReadOnlyError).message).toMatch(
      /^Write query attempted while in readonly mode: UPDATE /,
    );
  });

  it("deleting a record raises if preventing writes", async () => {
    const bird = await Bird.create({ name: "Bluejay" });
    const error = await Base.whilePreventingWrites(async () => {
      await bird.destroy();
    }).catch((e) => e);
    expect(error).toBeInstanceOf(ReadOnlyError);
    expect((error as ReadOnlyError).message).toMatch(
      /^Write query attempted while in readonly mode: DELETE /,
    );
  });

  it("selecting a record does not raise if preventing writes", async () => {
    const bird = await Bird.create({ name: "Bluejay" });
    let found: Bird | null = null;
    await Base.whilePreventingWrites(async () => {
      found = await Bird.where({ name: "Bluejay" }).last();
    });
    expect(found).not.toBeNull();
    expect((found as unknown as Bird).id).toBe(bird.id);
  });

  it("an explain query does not raise if preventing writes", async () => {
    await Bird.create({ name: "Bluejay" });
    await Base.whilePreventingWrites(async () => {
      const result = await Bird.where({ name: "Bluejay" }).explain();
      expect(typeof result).toBe("string");
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
