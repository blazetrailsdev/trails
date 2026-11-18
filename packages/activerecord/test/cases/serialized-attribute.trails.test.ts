import { describe, it, expect } from "vitest";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
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
  declare parent_id: number | null;
  static {
    this.tableName = "topics";
    this.serialize("content", { coder: AsyncCoder });
    constSet(TopLevel, "AsyncCoderTopic", this);
    this.hasMany("replies", { className: "AsyncCoderTopic", foreignKey: "parent_id" });
    this.belongsTo("parent", { className: "AsyncCoderTopic", foreignKey: "parent_id" });
  }
}

async function createTopicWithReply(): Promise<AsyncCoderTopic> {
  const topic = new AsyncCoderTopic();
  topic.content = new Loaded("parent");
  await _loadSerializedAttributes(topic);
  await topic.saveBang();
  const reply = new AsyncCoderTopic();
  reply.content = new Loaded("reply");
  reply.parent_id = topic.id as number;
  await _loadSerializedAttributes(reply);
  await reply.saveBang();
  return topic;
}

const AsyncDumpCoder = {
  load(value: unknown): Promise<Loaded> | null {
    return value == null ? null : Promise.resolve(new Loaded(String(value)));
  },
  dump(value: unknown): string | null | Promise<string> {
    if (value == null) return null;
    if (value instanceof Loaded) return value.text;
    return Promise.resolve(String(value).toUpperCase());
  },
};

class AsyncDumpTopic extends Base {
  declare content: Loaded | null;
  static {
    this.tableName = "topics";
    this.serialize("content", { coder: AsyncDumpCoder });
  }
}

const CountingCoder = {
  loads: 0,
  load(value: unknown): string | null {
    if (value == null) return null;
    CountingCoder.loads += 1;
    return String(value);
  },
  dump(value: unknown): string | null {
    return value == null ? null : String(value);
  },
};

class CountingCoderTopic extends Base {
  declare content: string | null;
  static {
    this.tableName = "topics";
    this.serialize("content", { coder: CountingCoder });
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

  it("writes the value an async dump produced once the writer has awaited it", async () => {
    const topic = new AsyncDumpTopic();
    (topic as unknown as { content: unknown }).content = "shout";
    await _loadSerializedAttributes(topic);
    expect(topic.content).toEqual(new Loaded("SHOUT"));

    await topic.saveBang();
    const found = await AsyncDumpTopic.find(topic.id);
    expect(found.content).toEqual(new Loaded("SHOUT"));
    expect(found.content!.text).toBe("SHOUT");
  });

  it("loads an async coder's value on preloaded association targets", async () => {
    const topic = await createTopicWithReply();
    const [found] = await AsyncCoderTopic.where({ id: topic.id }).preload("replies");
    const replies = await (
      found as unknown as { replies: { toArray(): Promise<AsyncCoderTopic[]> } }
    ).replies.toArray();
    expect(replies.map((r) => r.content)).toEqual([new Loaded("reply")]);
  });

  it("loads an async coder's value on JOIN eager-loaded association targets", async () => {
    const topic = await createTopicWithReply();
    const [found] = await AsyncCoderTopic.where({ id: topic.id }).eagerLoad("replies");
    expect(found.content).toEqual(new Loaded("parent"));
    const replies = found.association("replies").target as AsyncCoderTopic[];
    expect(replies.map((r) => r.content)).toEqual([new Loaded("reply")]);
  });

  it("loads an async coder's value on an association load", async () => {
    const topic = await createTopicWithReply();
    const [reply] = await (
      topic as unknown as { replies: { toArray(): Promise<AsyncCoderTopic[]> } }
    ).replies.toArray();
    expect(reply.content).toEqual(new Loaded("reply"));
    const parent = await (reply as unknown as { parent: Promise<AsyncCoderTopic> }).parent;
    expect(parent.content).toEqual(new Loaded("parent"));
  });

  it("probes a sync user coder once per type and leaves later reads lazy", async () => {
    const topic = await CountingCoderTopic.createBang({ content: "once" });
    await CountingCoderTopic.find(topic.id);
    CountingCoder.loads = 0;

    const found = await CountingCoderTopic.find(topic.id);
    expect(CountingCoder.loads).toBe(0);
    expect(found.content).toBe("once");
    expect(CountingCoder.loads).toBe(1);
  });
});
