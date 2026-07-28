/**
 * Mirrors: activerecord/test/cases/core_test.rb
 * Test names are kept verbatim per CLAUDE.md so test:compare matches Rails.
 */
import { describe, it, expect } from "vitest";
import { Base } from "./index.js";
import { formatForInspect } from "./attribute-inspection.js";

import { pp } from "./pretty-print.js";
import { fixtures } from "./test-fixtures.js";
import { Topic, TitlePrimaryKeyTopic } from "./test-helpers/models/topic.js";
import { CpkBook } from "./test-helpers/models/cpk.js";

describe("CoreTest", () => {
  // Rails `CoreTest` declares `fixtures :topics`; every inspect/pretty-print
  // case reads `topics(:first)` (id 1, "The First Topic", author "David").
  const { topics } = fixtures(["topics"]);

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

  it("inspect instance with lambda date formatter", async () => {
    // Rails swaps Time::DATE_FORMATS[:inspect] for a lambda and asserts the
    // date column still renders "2004-04-15" — a Date is formatted through
    // Date::DATE_FORMATS, so the Time lambda never applies. trails has no
    // DATE_FORMATS registry (Temporal values render ISO directly), so the
    // pinned behavior — a time-format override cannot leak into a date
    // column — holds by construction; the assertion is ported verbatim.
    await withAttributesForInspect(["id", "last_read"], () => {
      const topic = topics("first") as any;
      expect(topic.inspect()).toBe(`#<Topic id: 1, last_read: "2004-04-15">`);
    });
  });

  it("inspect new instance", () => {
    expect(new Topic({}).inspect()).toMatch(/Topic id: nil/);
  });

  // Permanent skip: Ruby-only. `Topic.new.singleton_class.inspect` exercises
  // Ruby's per-object singleton class (`#<Class:#<Topic:0x...>>`); JS has no
  // singleton-class concept and no AR code participates in that rendering.
  it.skip("inspect singleton instance", () => {});

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

  it("inspect with overridden attribute for inspect", () => {
    const topic = topics("first") as any;
    const superAttributeForInspect = topic.attributeForInspect.bind(topic);
    topic.attributeForInspect = (attrName: string) =>
      attrName === "title"
        ? JSON.stringify(topic.readAttribute("title").toUpperCase())
        : superAttributeForInspect(attrName);
    expect(topic.fullInspect()).toMatch(/title: "THE FIRST TOPIC"/);
  });

  it("full inspect lists all attributes", async () => {
    // Rails full_inspect == inspect_with_attributes(all_attributes_for_inspect),
    // ignoring attributes_for_inspect: stub it to a limited list and confirm
    // every attribute is still emitted (core.rb:786-793).
    await withAttributesForInspect(["id", "title"], () => {
      const topic = topics("first") as any;
      expect(topic.fullInspect()).toBe(fullInspectString(topic));
    });
  });

  // The pretty print family drives trails' `pp(obj, io)` (pretty-print.ts), the
  // analogue of Ruby's `PP.pp(topic, StringIO.new(actual))`. Our PrettyPrinter
  // renders breakables as spaces and has no object address, so where Rails
  // asserts a multi-line `#<Topic:0x...>` block, the ported expectation is the
  // same attribute list on one line without the `:0x...` address.
  async function ppString(obj: unknown): Promise<string> {
    let out = "";
    await pp(obj, { write: (s: string) => (out += s) });
    return out;
  }

  it("pretty print new", async () => {
    const topic = new Topic({});
    expect(await ppString(topic)).toBe(
      `#<Topic id: nil, title: nil, author_name: nil, ` +
        `author_email_address: "test@test.com", written_on: nil, bonus_time: nil, ` +
        `last_read: nil, content: nil, important: nil, binary_content: nil, ` +
        `approved: true, replies_count: 0, unique_replies_count: 0, parent_id: nil, ` +
        `parent_title: nil, type: nil, group: nil, created_at: nil, updated_at: nil>\n`,
    );
  });

  it("pretty print persisted", async () => {
    const topic = topics("first") as any;
    expect(await ppString(topic)).toBe(`${fullInspectString(topic)}\n`);
  });

  it("pretty print full", async () => {
    await withAttributesForInspect("all", async () => {
      const topic = topics("first") as any;
      expect(await ppString(topic)).toBe(`${fullInspectString(topic)}\n`);
    });
  });

  it("pretty print uninitialized", async () => {
    // Rails: `Topic.allocate` — an instance that skipped initialize, so
    // `@attributes` is unset and pretty_print renders "not initialized".
    const topic = Object.create(Topic.prototype);
    expect(await ppString(topic)).toBe("#<Topic not initialized>\n");
  });

  it("pretty print overridden by inspect", async () => {
    class Subtopic extends Topic {}
    // Base declares `inspect` as a property type, so an `override` method
    // declaration is rejected by TS; define the override on the prototype
    // (an own property, which is what isCustomInspectMethodDefined checks).
    (Subtopic.prototype as any).inspect = () => "inspecting topic";
    expect(await ppString(new Subtopic({}))).toBe("inspecting topic\n");
  });

  it("pretty print with non primary key id attribute", async () => {
    const topic = (topics("first") as any).becomes(TitlePrimaryKeyTopic);
    expect(await ppString(topic)).toMatch(/id: 1/);
  });

  it("pretty print with overridden attribute for inspect", async () => {
    const topic = topics("first") as any;
    const superAttributeForInspect = topic.attributeForInspect.bind(topic);
    topic.attributeForInspect = (attrName: string) =>
      attrName === "title"
        ? JSON.stringify(topic.readAttribute("title").toUpperCase())
        : superAttributeForInspect(attrName);
    await withAttributesForInspect("all", async () => {
      expect(await ppString(topic)).toMatch(/title: "THE FIRST TOPIC"/);
    });
  });

  it("find by cache does not duplicate entries", async () => {
    Topic.initializeFindByCache();
    const usingPreparedStatements = (Topic.connection as { preparedStatements: boolean })
      .preparedStatements;
    const topicFindByCache = Topic._findByStatementCache!.get(usingPreparedStatements)!;

    const before = topicFindByCache.size;
    await Topic.find(1);
    expect(topicFindByCache.size).toBe(before + 1);

    const afterFind = topicFindByCache.size;
    await Topic.findBy({ id: 1 });
    expect(topicFindByCache.size).toBe(afterFind);
  });

  it("composite pk models equality", () => {
    expect(new CpkBook({ id: [1, 2] }).equals(new CpkBook({ id: [1, 2] }))).toBe(true);

    expect(new CpkBook({ id: [1, 2] }).equals(new CpkBook({ id: [1, 3] }))).toBe(false);
    expect(new CpkBook().equals(new CpkBook())).toBe(false);
    expect(new CpkBook({ title: "Book A" }).equals(new CpkBook({ title: "Book B" }))).toBe(false);
    expect(new CpkBook({ author_id: 1 }).equals(new CpkBook({ author_id: 1 }))).toBe(false);
    expect(
      new CpkBook({ author_id: 1, title: "Same title" }).equals(
        new CpkBook({ author_id: 1, title: "Same title" }),
      ),
    ).toBe(false);
  });

  it("composite pk models added to a set", () => {
    const library = new Set<unknown>();
    // with primary key present
    library.add(new CpkBook({ id: [1, 2] }).hash());

    // duplicate
    library.add(new CpkBook({ id: [1, 3] }).hash());
    library.add(new CpkBook({ id: [1, 3] }).hash());

    // without primary key being set
    library.add(new CpkBook({ title: "Book A" }).hash());
    library.add(new CpkBook({ title: "Book B" }).hash());

    expect(library.size).toBe(4);
  });

  it("composite pk models hash", () => {
    expect(new CpkBook({ id: [1, 2] }).hash()).toEqual(new CpkBook({ id: [1, 2] }).hash());

    expect(new CpkBook({ id: [1, 2] }).hash()).not.toEqual(new CpkBook({ id: [1, 3] }).hash());
    expect(new CpkBook().hash()).not.toEqual(new CpkBook().hash());
    expect(new CpkBook({ title: "Book A" }).hash()).not.toEqual(
      new CpkBook({ title: "Book B" }).hash(),
    );
    expect(new CpkBook({ author_id: 1 }).hash()).not.toEqual(new CpkBook({ author_id: 1 }).hash());
    expect(new CpkBook({ author_id: 1, title: "Same title" }).hash()).not.toEqual(
      new CpkBook({ author_id: 1, title: "Same title" }).hash(),
    );
  });
});
