/**
 * Mirrors: activerecord/test/cases/core_test.rb
 * Test names are kept verbatim per CLAUDE.md so test:compare matches Rails.
 */
import { describe, it, expect } from "vitest";
import { Base } from "./index.js";
import { formatForInspect } from "./attribute-inspection.js";

import { fixtures } from "./test-helpers/fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";
import { Topic, TitlePrimaryKeyTopic } from "./test-helpers/models/topic.js";

describe("CoreTest", () => {
  // Rails `CoreTest` declares `fixtures :topics`; every inspect/pretty-print
  // case reads `topics(:first)` (id 1, "The First Topic", author "David").
  const { topics } = fixtures(["topics"], { schema: canonicalSchema });

  /** Stub `Topic.attributes_for_inspect`, restoring the prior own-property. */
  async function withAttributesForInspect<T>(value: unknown, fn: () => T | Promise<T>): Promise<T> {
    const had = Object.prototype.hasOwnProperty.call(Topic, "attributesForInspect");
    const prev = (Topic as any).attributesForInspect;
    (Topic as any).attributesForInspect = value;
    try {
      return await fn();
    } finally {
      if (had) (Topic as any).attributesForInspect = prev;
      else delete (Topic as any).attributesForInspect;
    }
  }

  /**
   * Build the full Rails inspect string for `topics(:first)`. As in Rails
   * (`written_on: "#{topic.written_on.to_fs(:inspect)}"`), the datetime/date
   * fields are interpolated through the same formatter inspect uses
   * (`formatForInspect`), so the assertion pins column order + the static
   * values without re-encoding adapter-specific timestamp text.
   */
  function fullInspectString(topic: any): string {
    const f = (name: string) => formatForInspect.call(topic, name, topic[name]);
    return (
      `#<Topic id: 1, title: "The First Topic", author_name: "David", ` +
      `author_email_address: "david@loudthinking.com", ` +
      `written_on: ${f("written_on")}, bonus_time: ${f("bonus_time")}, ` +
      `last_read: ${f("last_read")}, content: "Have a nice day", important: nil, ` +
      `binary_content: nil, approved: false, replies_count: 1, unique_replies_count: 0, ` +
      `parent_id: nil, parent_title: nil, type: nil, group: nil, ` +
      `created_at: ${f("created_at")}, updated_at: ${f("updated_at")}>`
    );
  }

  it("inspect class", () => {
    // Rails also asserts `ActiveRecord::Base.inspect == "ActiveRecord::Base"`;
    // trails' base class is named `Base` (no `ActiveRecord::` namespace), a
    // naming divergence orthogonal to the schema-listing behavior under test.
    expect(Topic.inspect()).toMatch(/^Topic\(id: integer, title: string/);
  });

  it("inspect instance", () => {
    const topic = topics("first") as any;
    expect(topic.inspect()).toBe(fullInspectString(topic));
  });

  it("inspect includes attributes from attributes for inspect", async () => {
    await withAttributesForInspect(["id", "title", "author_name"], () => {
      const topic = topics("first") as any;
      expect(topic.inspect()).toBe(
        `#<Topic id: 1, title: "The First Topic", author_name: "David">`,
      );
    });
  });

  it("inspect new instance", () => {
    expect(new Topic({}).inspect()).toMatch(/Topic id: nil/);
  });

  it("inspect limited select instance", async () => {
    await withAttributesForInspect(["id", "title"], async () => {
      const onlyId = (await Topic.select("id").where("id = 1"))[0] as any;
      expect(onlyId.inspect()).toBe(`#<Topic id: 1>`);
      const idTitle = (await Topic.select("id, title").where("id = 1"))[0] as any;
      expect(idTitle.inspect()).toBe(`#<Topic id: 1, title: "The First Topic">`);
    });
  });

  it("inspect instance with non primary key id attribute", () => {
    const topic = (topics("first") as any).becomes(TitlePrimaryKeyTopic);
    expect(topic.inspect()).toMatch(/id: 1/);
  });

  it("inspect class without table", () => {
    class NonExistentTable extends Base {}
    expect(NonExistentTable.inspect()).toBe("NonExistentTable(Table doesn't exist)");
  });

  it("inspect with attributes for inspect all lists all attributes", async () => {
    await withAttributesForInspect("all", () => {
      const topic = topics("first") as any;
      expect(topic.inspect()).toBe(fullInspectString(topic));
    });
  });

  it("inspect relation with virtual field", async () => {
    const first = (await Topic.limit(1).select("1 as virtual_field"))[0] as any;
    expect(first.fullInspect()).toMatch(/virtual_field: 1/);
  });

  // Rails overrides `attribute_for_inspect` on a single instance and expects
  // full_inspect to honor it. trails' inspectWithAttributes inlines
  // formatForInspect instead of dispatching through the overridable
  // attributeForInspect, so the override is bypassed.
  // Tracked: 0023-surfaced-deviations/inspect-dispatch-overridable-attribute-for-inspect.
  it.skip("inspect with overridden attribute for inspect", () => {});

  it("full inspect lists all attributes", async () => {
    // Rails full_inspect == inspect_with_attributes(all_attributes_for_inspect),
    // ignoring attributes_for_inspect: stub it to a limited list and confirm
    // every attribute is still emitted (core.rb:786-793).
    await withAttributesForInspect(["id", "title"], () => {
      const topic = topics("first") as any;
      expect(topic.fullInspect()).toBe(fullInspectString(topic));
    });
  });

  // Rails introspects `@find_by_statement_cache` size via
  // initialize_find_by_cache. trails exposes no equivalent statement-cache
  // surface to assert against.
  // Tracked: 0023-surfaced-deviations/find-by-statement-cache-introspection.
  it.skip("find by cache does not duplicate entries", () => {});

  // Rails: Cpk::Book.new(id: [1, 2]) == Cpk::Book.new(id: [1, 2]) is true.
  // trails returns false for equal composite ids on new records.
  // Tracked: 0023-surfaced-deviations/cpk-equality-new-record-composite-id.
  it.skip("composite pk models equality", () => {});
});
