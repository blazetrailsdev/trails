import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Base } from "../index.js";
import { createSidecarTestAdapter, type SidecarAdapter } from "../test-adapter.js";
import { defineSchema } from "../test-helpers/define-schema.js";
import { withTransactionalFixtures } from "../test-helpers/with-transactional-fixtures.js";

vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");

describe("StringTypeTest", () => {
  let adapter: SidecarAdapter;

  beforeAll(async () => {
    ({ adapter } = createSidecarTestAdapter());
    await defineSchema(adapter, { authors: { name: "string" } });
  });
  withTransactionalFixtures(() => adapter);

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it("string mutations are detected", async () => {
    class Author extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    const author = await Author.create({ name: "Sean" });
    expect(author.changed).toBe(false);

    // JS strings are immutable; assignment goes through the setter rather than mutating in place.
    // nameChanged() fires via dirty-tracker change detection, not isChangedInPlace.
    author.name = String(author.name) + " Griffin";
    expect((author as any).nameChanged()).toBe(true);

    await author.save();
    await author.reload();

    expect(author.name).toBe("Sean Griffin");
    expect(author.changed).toBe(false);
  });
});
