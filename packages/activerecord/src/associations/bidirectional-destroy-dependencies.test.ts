/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 *
 * Mirrors associations/bidirectional_destroy_dependencies_test.rb — the
 * mutually `dependent: :destroy` Content/ContentPosition pair. Rails declares
 * `fixtures :content, :content_positions`; we mirror that with one
 * `fixtures` call seeding the canonical tables.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { registerModel } from "../index.js";
import { fixtures } from "../test-helpers/fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "../test-helpers/test-schema.js";
import {
  Content,
  ContentPosition,
  ContentWhichRequiresTwoDestroyCalls,
} from "../test-helpers/models/content.js";

describe("BidirectionalDestroyDependenciesTest", () => {
  fixtures(["content", "contentPositions"], { schema: canonicalSchema });

  registerModel(Content);
  registerModel(ContentPosition);
  registerModel(ContentWhichRequiresTwoDestroyCalls);

  beforeEach(() => {
    Content.destroyedIds.length = 0;
    ContentPosition.destroyedIds.length = 0;
  });

  it("bidirectional dependence when destroying item with belongs to association", async () => {
    const contentPosition = await ContentPosition.find(1);
    const content = await contentPosition.association("content").loadTarget();
    expect(content).not.toBeNull();

    await contentPosition.destroy();

    expect(ContentPosition.destroyedIds).toEqual([contentPosition.id]);
    expect(Content.destroyedIds).toEqual([(content as Content).id]);
  });

  it("bidirectional dependence when destroying item with has one association", async () => {
    const content = await Content.find(1);
    const contentPosition = await content.association("contentPosition").loadTarget();
    expect(contentPosition).not.toBeNull();

    await content.destroy();

    expect(Content.destroyedIds).toEqual([content.id]);
    expect(ContentPosition.destroyedIds).toEqual([(contentPosition as ContentPosition).id]);
  });

  it("bidirectional dependence when destroying item with has one association fails first time", async () => {
    const content = await ContentWhichRequiresTwoDestroyCalls.find(1);

    await content.destroy();
    await content.destroy();

    expect(content.isDestroyed()).toBe(true);
  });
});
