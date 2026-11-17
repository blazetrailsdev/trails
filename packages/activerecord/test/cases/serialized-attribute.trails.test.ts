import { describe, it, expect } from "vitest";
import { Base, _loadSerializedAttributes } from "../../lib/index.js";
import { fixtures } from "../support/use-fixtures.js";
import { YAML } from "@blazetrails/ruby-compat/yaml";
import { buildColumnSerializer } from "../../lib/attribute-methods/serialization.js";
import { YAMLColumn } from "../../lib/coders/yaml-column.js";

describe("SerializedAttributeTest", () => {
  it("coder YAML builds a YAMLColumn, as coder YAMLColumn does", () => {
    const viaYaml = buildColumnSerializer("content", YAML, Object);
    const viaColumn = buildColumnSerializer("content", YAMLColumn, Object);

    expect(viaYaml).toBeInstanceOf(YAMLColumn);
    expect(viaColumn).toBeInstanceOf(YAMLColumn);
    expect((viaYaml as YAMLColumn).dump({ a: 1 })).toBe((viaColumn as YAMLColumn).dump({ a: 1 }));
  });
});

class Loaded {
  constructor(readonly text: string) {}
  equals(other: unknown): boolean {
    return other instanceof Loaded && other.text === this.text;
  }
}

const AsyncCoder = {
  rejectNext: false,
  load(value: unknown): Promise<Loaded> | null {
    if (value == null) return null;
    if (AsyncCoder.rejectNext) return Promise.reject(new Error("load failed"));
    return Promise.resolve(new Loaded(String(value)));
  },
  dump(value: unknown): string | null {
    return value == null ? null : (value as Loaded).text;
  },
};

class AsyncCoderTopic extends Base {
  declare content: Loaded | null;
  static {
    this.tableName = "topics";
    this.serialize("content", { coder: AsyncCoder });
  }
}

describe("SerializedAttributeTest with an async coder", () => {
  fixtures(["topics"]);

  it("loads an async coder's value when the record is built and after save", async () => {
    const topic = new AsyncCoderTopic();
    topic.content = new Loaded("hello");
    await _loadSerializedAttributes(topic);
    expect(topic.content).toEqual(new Loaded("hello"));

    await topic.saveBang();
    expect(topic.content).toBeInstanceOf(Loaded);

    const found = await AsyncCoderTopic.find(topic.id);
    expect(found.content).toEqual(new Loaded("hello"));
    const [bySql] = await AsyncCoderTopic.findBySql(
      `SELECT * FROM topics WHERE id = ${Number(topic.id)}`,
    );
    expect(bySql.content).toEqual(new Loaded("hello"));
  });

  it("surfaces a rejection from the coder's load at the awaited find", async () => {
    const topic = new AsyncCoderTopic();
    topic.content = new Loaded("boom");
    await _loadSerializedAttributes(topic);
    await topic.saveBang();

    AsyncCoder.rejectNext = true;
    try {
      await expect(AsyncCoderTopic.find(topic.id)).rejects.toThrow("load failed");
    } finally {
      AsyncCoder.rejectNext = false;
    }
  });
});
