import { readFile } from "fs/promises";
import { describe, it, expect } from "vitest";
import * as YAML from "@blazetrails/activesupport/yaml";
import { DateTime } from "@blazetrails/date";
import { assertRaises } from "@blazetrails/activesupport";
import { RuntimeError } from "@blazetrails/ruby-compat";
import { fixtures } from "./test-fixtures.js";
import { withTimezoneConfig } from "./test-helper.js";
import { Topic } from "./test-helpers/models/topic.js";
import { Author } from "./test-helpers/models/author.js";

const TEST_ROOT = new URL("./test-helpers/", import.meta.url);

describe("YamlSerializationTest", () => {
  fixtures(["topics", "authors", "posts"]);

  function yamlLoad<T = Topic>(payload: string): T {
    return YAML.unsafeLoad(payload) as T;
  }

  async function yamlFixture(fileName: string): Promise<string> {
    const path = `support/yaml_compatibility_fixtures/${fileName}.yml`;
    return readFile(new URL(path, TEST_ROOT), "utf8");
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

  it("roundtrip serialized column", () => {
    const topic = new Topic({ content: { omg: "lol" } });
    expect(yamlLoad(YAML.dump(topic)).content).toEqual({ omg: "lol" });
  });

  it("psych roundtrip", async () => {
    const topic = await Topic.first();
    expect(topic).toBeTruthy();
    const t = yamlLoad(YAML.dump(topic));
    expect(topic!.equals(t)).toBe(true);
  });

  it("psych roundtrip new object", () => {
    const topic = new Topic();
    expect(topic).toBeTruthy();
    const t = yamlLoad(YAML.dump(topic));
    expect(t.attributes).toEqual(topic.attributes);
  });

  it.skip("active record relation serialization", () => {
    // BLOCKED: relation-to-yaml-psych-dump
    expect(() => YAML.dump([Topic.all()])).not.toThrow();
  });

  it("raw types are not changed on round trip", () => {
    const topic = new Topic({ parent_id: "123" });
    expect(topic.readAttributeBeforeTypeCast("parent_id")).toBe("123");
    expect(yamlLoad(YAML.dump(topic)).readAttributeBeforeTypeCast("parent_id")).toBe("123");
  });

  it("cast types are not changed on round trip", () => {
    const topic = new Topic({ parent_id: "123" });
    expect(topic.parent_id).toBe(123);
    expect(yamlLoad(YAML.dump(topic)).parent_id).toBe(123);
  });

  it("new records remain new after round trip", async () => {
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

  it("types of virtual columns are not changed on round trip", async () => {
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

  it("deserializing rails v1 mysql yaml", async () => {
    const topic = yamlLoad(await yamlFixture("rails_v1_mysql"));

    expect(topic.isNewRecord()).toBe(false);
    expect(topic.id).toBe(1);
    expect(topic.title).toBe("The First Topic");
    expect(topic.content).toBe("Have a nice day");
  });

  it("deserializing rails 41 yaml", async () => {
    const payload = await yamlFixture("rails_4_1_no_symbol");
    const error = await assertRaises([RuntimeError], {}, () => yamlLoad(payload));
    expect(error.message).toBe("Active Record doesn't know how to load YAML with this format.");
  });

  it("deserializing rails 4 2 0 yaml", async () => {
    const payload = await yamlFixture("rails_4_2_0");
    const error = await assertRaises([RuntimeError], {}, () => yamlLoad(payload));
    expect(error.message).toBe("Active Record doesn't know how to load YAML with this format.");
  });

  it("yaml encoding keeps mutations", async () => {
    const author = (await Author.first())!;
    author.name = "Sean";
    const dumped = yamlLoad<Author>(YAML.dump(author));

    expect(dumped.name).toBe("Sean");
    expect(dumped.attributeWas("name")).toBe(author.attributeWas("name"));
    expect(dumped.changes).toEqual(author.changes);
  });

  it("yaml encoding keeps false values", async () => {
    const topic = (await Topic.first())!;
    topic.approved = false;
    const dumped = yamlLoad(YAML.dump(topic));

    expect(dumped.approved).toBe(false);
  });
});
