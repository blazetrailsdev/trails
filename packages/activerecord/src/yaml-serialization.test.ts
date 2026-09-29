import { readFile } from "fs/promises";
import { describe, it, expect } from "vitest";
import * as YAML from "@blazetrails/activesupport/yaml";
import { DateTime } from "@blazetrails/date";
import { fixtures } from "./test-fixtures.js";
import { withTimezoneConfig } from "./test-helper.js";
import { Topic } from "./test-helpers/models/topic.js";
import { Author } from "./test-helpers/models/author.js";

describe("YamlSerializationTest", () => {
  fixtures(["topics", "authors", "posts"]);

  function yamlLoad<T = Topic>(payload: string): T {
    return YAML.unsafeLoad(payload) as T;
  }

  async function yamlFixture(fileName: string): Promise<string> {
    return readFile(
      new URL(
        `./test-helpers/support/yaml_compatibility_fixtures/${fileName}.yml`,
        import.meta.url,
      ),
      "utf8",
    );
  }

  it("to yaml with time with zone should not raise exception", async () => {
    try {
      await withTimezoneConfig(
        { awareAttributes: true, zone: "Pacific Time (US & Canada)" },
        async () => {
          const topic = new Topic({ written_on: DateTime.now() });
          expect(() => YAML.dump(topic)).not.toThrow();
        },
      );
    } finally {
      Topic.resetColumnInformation();
    }
  });

  it("roundtrip", async () => {
    const topic = await Topic.first();
    expect(topic).toBeTruthy();
    const t = yamlLoad(YAML.dump(topic));
    expect(topic!.equals(t)).toBe(true);
  });

  it.skip("roundtrip serialized column", () => {
    // BLOCKED: psych-dump-type-constants
    const topic = new Topic({ content: { omg: "lol" } });
    expect(yamlLoad(YAML.dump(topic)).content).toEqual({ omg: "lol" });
  });

  it("psych roundtrip", async () => {
    const topic = await Topic.first();
    expect(topic).toBeTruthy();
    const t = yamlLoad(YAML.dump(topic));
    expect(topic!.equals(t)).toBe(true);
  });

  it.skip("psych roundtrip new object", () => {
    // BLOCKED: psych-dump-type-constants
    const topic = new Topic();
    expect(topic).toBeTruthy();
    const t = yamlLoad(YAML.dump(topic));
    expect(t.attributes).toEqual(topic.attributes);
  });

  it.skip("active record relation serialization", () => {
    // BLOCKED: relation-to-yaml-psych-dump
    expect(() => YAML.dump([Topic.all()])).not.toThrow();
  });

  it.skip("raw types are not changed on round trip", () => {
    // BLOCKED: psych-dump-type-constants
    const topic = new Topic({ parent_id: "123" });
    expect(topic.readAttributeBeforeTypeCast("parent_id")).toBe("123");
    expect(yamlLoad(YAML.dump(topic)).readAttributeBeforeTypeCast("parent_id")).toBe("123");
  });

  it.skip("cast types are not changed on round trip", () => {
    // BLOCKED: psych-dump-type-constants
    const topic = new Topic({ parent_id: "123" });
    expect(topic.parent_id).toBe(123);
    expect(yamlLoad(YAML.dump(topic)).parent_id).toBe(123);
  });

  it.skip("new records remain new after round trip", async () => {
    // BLOCKED: psych-dump-type-constants
    let topic = new Topic();

    expect(topic.isNewRecord()).toBe(true);
    expect(yamlLoad(YAML.dump(topic)).isNewRecord()).toBe(true);

    await topic.saveBang();

    expect(topic.isNewRecord()).toBe(false);
    expect(yamlLoad(YAML.dump(topic)).isNewRecord()).toBe(false);

    topic = (await Topic.select("title").last())!;

    expect(topic.isNewRecord()).toBe(false);
    expect(yamlLoad(YAML.dump(topic)).isNewRecord()).toBe(false);
  });

  it.skip("types of virtual columns are not changed on round trip", async () => {
    // BLOCKED: psych-dump-type-constants
    const author = (await Author.select("authors.*, count(posts.id) as posts_count")
      .joins(":posts")
      .group("authors.id")
      .first()) as Author & { posts_count: number };
    const dumped = yamlLoad<typeof author>(YAML.dump(author));

    expect(author.posts_count).toBe(5);
    expect(dumped.posts_count).toBe(5);
  });

  it("a yaml version is provided for future backwards compat", async () => {
    const coder: Record<string, unknown> = {};
    (await Topic.first())!.encodeWith(coder);

    expect(coder["active_record_yaml_version"]).toBeTruthy();
  });

  it("deserializing rails v2 yaml", async () => {
    const topic = yamlLoad(await yamlFixture("rails_v2"));

    expect(topic.isNewRecord()).toBe(false);
    expect(topic.id).toBe(1);
    expect(topic.title).toBe("The First Topic");
    expect(topic.content).toBe("Have a nice day");
  });

  it.skip("deserializing rails v1 mysql yaml", () => {
    // BLOCKED: psych-dump-type-constants
  });

  it("deserializing rails 41 yaml", async () => {
    const payload = await yamlFixture("rails_4_1_no_symbol");
    expect(() => yamlLoad(payload)).toThrow(
      "Active Record doesn't know how to load YAML with this format.",
    );
  });

  it.skip("deserializing rails 4 2 0 yaml", () => {
    // BLOCKED: psych-dump-type-constants
  });

  it.skip("yaml encoding keeps mutations", async () => {
    // BLOCKED: psych-dump-type-constants
    const author = (await Author.first())!;
    author.name = "Sean";
    const dumped = yamlLoad<Author>(YAML.dump(author));

    expect(dumped.name).toBe("Sean");
    expect(dumped.attributeWas("name")).toBe(author.attributeWas("name"));
    expect(dumped.changes).toEqual(author.changes);
  });

  it.skip("yaml encoding keeps false values", async () => {
    // BLOCKED: psych-dump-type-constants
    const topic = (await Topic.first())!;
    topic.approved = false;
    const dumped = yamlLoad(YAML.dump(topic));

    expect(dumped.approved).toBe(false);
  });
});
