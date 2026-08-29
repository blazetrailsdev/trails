import { describe, it, expect } from "vitest";
import { Base } from "./index.js";
import { formatForInspect } from "./attribute-inspection.js";

import { pp } from "./pretty-print.js";
import { fixtures } from "./test-fixtures.js";
import { Topic, TitlePrimaryKeyTopic } from "./test-helpers/models/topic.js";
import { CpkBook } from "./test-helpers/models/cpk.js";

describe("CoreTest", () => {
  const { topics } = fixtures(["topics"]);

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
    await withAttributesForInspect(["id", "last_read"], () => {
      const topic = topics("first") as any;
      expect(topic.inspect()).toBe(`#<Topic id: 1, last_read: "2004-04-15">`);
    });
  });

  it("inspect new instance", () => {
    expect(new Topic({}).inspect()).toMatch(/Topic id: nil/);
  });

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
    await withAttributesForInspect(["id", "title"], () => {
      const topic = topics("first") as any;
      expect(topic.fullInspect()).toBe(fullInspectString(topic));
    });
  });

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
    const topic = Object.create(Topic.prototype);
    expect(await ppString(topic)).toBe("#<Topic not initialized>\n");
  });

  it("pretty print overridden by inspect", async () => {
    class Subtopic extends Topic {}
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
    library.add(new CpkBook({ id: [1, 2] }).hash());

    library.add(new CpkBook({ id: [1, 3] }).hash());
    library.add(new CpkBook({ id: [1, 3] }).hash());

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
