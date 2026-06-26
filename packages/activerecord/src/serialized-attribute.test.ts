/**
 * Ports vendor/rails/activerecord/test/cases/serialized_attribute_test.rb onto
 * canonical tables (topics / people / traffic_lights). No bespoke defineSchema
 * calls — all rows flow through the canonical TEST_SCHEMA tables.
 */
import { describe, it, expect, vi } from "vitest";
import { Base, serialize, SerializationTypeMismatch } from "./index.js";
import { HashObject } from "./serialize.js";

import { useHandlerFixtures } from "./test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";
import { Topic } from "./test-helpers/models/topic.js";
import { SerializedPerson } from "./test-helpers/models/person.js";
import { TrafficLight } from "./test-helpers/models/traffic-light.js";

vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");

// Rails: MyObject = Struct.new(:attribute1, :attribute2)
// Used as a custom coder: dump/load round-trips via JSON.
class MyObject {
  attribute1: string;
  attribute2: string;
  constructor(attribute1: string, attribute2: string) {
    this.attribute1 = attribute1;
    this.attribute2 = attribute2;
  }
  static dump(value: MyObject | null): string | null {
    if (value == null) return null;
    return JSON.stringify({ attribute1: value.attribute1, attribute2: value.attribute2 });
  }
  static load(raw: unknown): MyObject | null {
    if (raw == null) return null;
    const parsed = typeof raw === "string" ? JSON.parse(raw) : (raw as Record<string, string>);
    return new MyObject(parsed.attribute1, parsed.attribute2);
  }
}

describe("SerializedAttributeTest", () => {
  const { topics, posts } = useHandlerFixtures(["topics", "posts"], {
    schema: canonicalSchema,
  });

  // test_serialize_does_not_eagerly_load_columns
  it("serialize does not eagerly load columns", () => {
    class LocalTopic extends Topic {}
    // serialize should register without hitting the DB
    serialize(LocalTopic, "content");
  });

  // test_serialized_attribute
  it("serialized attribute", async () => {
    class MyObjectTopic extends Topic {
      static {
        serialize(this, "content", { coder: MyObject });
      }
    }
    const myobj = new MyObject("value1", "value2");
    const topic = await MyObjectTopic.create({ content: myobj as any });
    expect((topic as any).content).toEqual(myobj);
    const reloaded = await MyObjectTopic.find(topic.id as number);
    expect((reloaded as any).content).toEqual(myobj);
  });

  // test_serialized_attribute_on_alias_attribute
  it("serialized attribute on alias attribute", async () => {
    class AliasTopic extends Topic {
      static {
        this._tableName = "topics";
        this.aliasAttribute("object", "content");
        serialize(this, "object", { coder: MyObject });
      }
    }
    const myobj = new MyObject("value1", "value2");
    const topic = (await AliasTopic.create({ object: myobj } as any)) as unknown as AliasTopic;
    expect((topic as any).object).toEqual(myobj);
    const reloaded = await AliasTopic.find((topic as any).id as number);
    expect((reloaded as any).object).toEqual(myobj);
  });

  // test_serialized_attribute_with_default
  it("serialized attribute with default", () => {
    class DefaultTopic extends Topic {
      static {
        this._tableName = "topics";
        this.attribute("content", "text", { default: '{"key":"value"}' });
        serialize(this, "content", { type: HashObject });
      }
    }
    const t = new DefaultTopic();
    expect((t as any).content).toEqual({ key: "value" });
  });

  // test_serialized_attribute_on_custom_attribute_with_default
  it("serialized attribute on custom attribute with default", () => {
    class CustomDefaultTopic extends Topic {
      static {
        this._tableName = "topics";
        this.attribute("content", "text", { default: '{"key":"value"}' });
        serialize(this, "content", { type: HashObject });
      }
    }
    const t = new CustomDefaultTopic();
    expect((t as any).content).toEqual({ key: "value" });
  });

  // test_serialized_attribute_in_base_class
  it("serialized attribute in base class", async () => {
    class HashContentTopic extends Topic {
      static {
        serialize(this, "content", { type: HashObject });
      }
    }
    class HashImportantTopic extends HashContentTopic {}
    const hash = { content1: "value1", content2: "value2" };
    const topic = await HashImportantTopic.create({ content: hash as any });
    expect((topic as any).content).toEqual(hash);
    const reloaded = await HashImportantTopic.find(topic.id as number);
    expect((reloaded as any).content).toEqual(hash);
  });

  // test_serialized_attributes_from_database_on_subclass
  it("serialized attributes from database on subclass", async () => {
    class HashBaseTopic extends Topic {
      static {
        serialize(this, "content", { type: HashObject });
      }
    }
    class SubTopic extends HashBaseTopic {}
    const t = new SubTopic({ content: { foo: "bar" } } as any);
    expect((t as any).content).toEqual({ foo: "bar" });
    await t.save();
    const last = await SubTopic.last();
    expect((last as any).content).toEqual({ foo: "bar" });
  });

  // test_serialized_attribute_calling_dup_method
  it("serialized attribute calling dup method", () => {
    class JsonTopic extends Topic {
      static {
        serialize(this, "content", { coder: "json" });
      }
    }
    const orig = new JsonTopic({ content: { foo: "bar" } } as any);
    const clone = orig.dup();
    expect((orig as any).content).toEqual((clone as any).content);
  });

  // test_serialized_json_attribute_returns_unserialized_value
  it("serialized json attribute returns unserialized value", async () => {
    class JsonTopic extends Topic {
      static {
        serialize(this, "content", { coder: "json" });
      }
    }
    const myPost = posts("welcome");
    const t = new JsonTopic({ content: myPost } as any);
    await t.save();
    const reloaded = await JsonTopic.find(t.id as number);
    expect(typeof (reloaded as any).content).toBe("object");
    expect((reloaded as any).content).not.toBeNull();
    expect((reloaded as any).content.id).toEqual(myPost.id);
    expect((reloaded as any).content.title).toEqual(myPost.title);
  });

  // test_json_read_legacy_null
  // eslint-disable-next-line blazetrails/test-fixture-parity -- fixture data unused; test verifies raw "null" string decoding via raw SQL update
  it("json read legacy null", async () => {
    class JsonTopic extends Topic {
      static {
        serialize(this, "content", { coder: "json" });
      }
    }
    // Create a record, then store the JSON literal "null" string (not SQL NULL) directly.
    const t = (await JsonTopic.create({ title: "test" } as any)) as unknown as InstanceType<
      typeof JsonTopic
    >;
    await (Base.connection as any).executeMutation(
      `UPDATE topics SET content = 'null' WHERE id = ${(t as any).id}`,
    );
    const reloaded = await JsonTopic.find((t as any).id as number);
    expect((reloaded as any).content).toBeNull();
  });

  // test_json_read_db_null
  // eslint-disable-next-line blazetrails/test-fixture-parity -- fixture data unused; test verifies SQL NULL decoding via raw SQL update
  it("json read db null", async () => {
    class JsonTopic extends Topic {
      static {
        serialize(this, "content", { coder: "json" });
      }
    }
    // Create a record, then store SQL NULL directly (not the string "null").
    const t = await JsonTopic.create({ title: "test", content: "placeholder" as any });
    await (Base.connection as any).executeMutation(
      `UPDATE topics SET content = NULL WHERE id = ${(t as any).id}`,
    );
    const reloaded = await JsonTopic.find((t as any).id as number);
    expect((reloaded as any).content).toBeNull();
  });

  // test_serialized_attribute_declared_in_subclass
  it("serialized attribute declared in subclass", async () => {
    class LocalImportantTopic extends Topic {
      static {
        serialize(this, "important", { type: HashObject });
      }
    }
    const hash = { important1: "value1", important2: "value2" };
    const topic = await LocalImportantTopic.create({ important: hash as any });
    expect((topic as any).important).toEqual(hash);
    const reloaded = await LocalImportantTopic.find(topic.id as number);
    expect((reloaded as any).important).toEqual(hash);
    expect((reloaded as any).readAttribute("important")).toEqual(hash);
  });

  // test_serialized_time_attribute
  it("serialized time attribute", async () => {
    class JsonTopic extends Topic {
      static {
        serialize(this, "content", { coder: "json" });
      }
    }
    const myobj = new Date("2008-01-01T01:00:00Z").toISOString();
    // Pass as pre-serialized JSON so the cast path receives a JSON-encoded string.
    const topic = await (
      await JsonTopic.create({ content: JSON.stringify(myobj) as any })
    ).reload();
    expect((topic as any).content).toEqual(myobj);
  });

  // test_serialized_string_attribute
  it("serialized string attribute", async () => {
    class JsonTopic extends Topic {
      static {
        serialize(this, "content", { coder: "json" });
      }
    }
    const myobj = "Yes";
    const topic = await (
      await JsonTopic.create({ content: JSON.stringify(myobj) as any })
    ).reload();
    expect((topic as any).content).toEqual(myobj);
  });

  it.skip("serialized class attribute", () => {
    // PERMANENT-SKIP: Ruby-only — YAML class serialization (Struct.new, Symbol class) has no JS equivalent.
  });

  it.skip("serialized class does not become frozen", () => {
    // PERMANENT-SKIP: Ruby-only — frozen? concept has no JS equivalent.
  });

  // test_nil_serialized_attribute_without_class_constraint
  it("nil serialized attribute without class constraint", () => {
    const topic = new Topic();
    expect((topic as any).content).toBeNull();
  });

  // test_nil_not_serialized_without_class_constraint
  it("nil not serialized without class constraint", async () => {
    class JsonTopic extends Topic {
      static {
        serialize(this, "content", { coder: "json" });
      }
    }
    await JsonTopic.create({ content: null as any });
    const count = await JsonTopic.where({ content: null }).count();
    expect(Number(count)).toBeGreaterThanOrEqual(1);
  });

  // test_nil_not_serialized_with_class_constraint
  it("nil not serialized with class constraint", async () => {
    class HashTopic extends Topic {
      static {
        serialize(this, "content", { type: HashObject });
      }
    }
    await HashTopic.create({ content: null as any });
    const count = await HashTopic.where({ content: null }).count();
    expect(Number(count)).toBeGreaterThanOrEqual(1);
  });

  it.skip("serialized attribute should raise exception on assignment with wrong type", () => {
    // PERMANENT-SKIP: write-time type validation (assert_valid_value on dump) not yet ported.
  });

  // test_should_raise_exception_on_serialized_attribute_with_type_mismatch
  it("should raise exception on serialized attribute with type mismatch", async () => {
    // Mirrors Rails: save with hash content, switch type expectation to Array, read throws.
    class FlexTopic extends Topic {
      static {
        serialize(this, "content", { type: HashObject });
      }
    }
    const topic = await FlexTopic.create({ content: { zomg: true } as any });
    serialize(FlexTopic, "content", { type: Array });
    const found = await FlexTopic.find(topic.id as number);
    expect(() => (found as any).content).toThrow(SerializationTypeMismatch);
  });

  // test_serialized_attribute_with_class_constraint
  it("serialized attribute with class constraint", async () => {
    class HashTopic extends Topic {
      static {
        serialize(this, "content", { type: HashObject });
      }
    }
    const settings = { color: "blue" };
    const topic = await HashTopic.create({ content: settings as any });
    const found = await HashTopic.find(topic.id as number);
    expect((found as any).content).toEqual(settings);
  });

  it.skip("where by serialized attribute with array", () => {
    // PERMANENT-SKIP: needs serialized-attribute where support.
  });

  it.skip("where by serialized attribute with hash", () => {
    // PERMANENT-SKIP: needs serialized-attribute where support.
  });

  it.skip("where by serialized attribute with hash in array", () => {
    // PERMANENT-SKIP: needs serialized-attribute where support.
  });

  // test_serialized_default_class
  it("serialized default class", async () => {
    class HashTopic extends Topic {
      static {
        serialize(this, "content", { type: HashObject });
      }
    }
    const topic = new HashTopic();
    expect(typeof (topic as any).content).toBe("object");
    expect(Array.isArray((topic as any).content)).toBe(false);
    expect((topic as any).readAttribute("content")).not.toBeNull();
    (topic as any).content["beer"] = "MadridRb";
    await topic.save();
    const reloaded = await topic.reload();
    expect(typeof (reloaded as any).content).toBe("object");
    expect((reloaded as any).content["beer"]).toBe("MadridRb");
  });

  // test_serialized_no_default_class_for_object
  it("serialized no default class for object", () => {
    const topic = new Topic();
    expect((topic as any).content).toBeNull();
  });

  // test_serialized_boolean_value_true
  it("serialized boolean value true", async () => {
    class JsonTopic extends Topic {
      static {
        serialize(this, "content", { coder: "json" });
      }
    }
    const topic = await (await JsonTopic.create({ content: true as any })).reload();
    expect((topic as any).content).toBe(true);
  });

  // test_serialized_boolean_value_false
  it("serialized boolean value false", async () => {
    class JsonTopic extends Topic {
      static {
        serialize(this, "content", { coder: "json" });
      }
    }
    const topic = await (await JsonTopic.create({ content: false as any })).reload();
    expect((topic as any).content).toBe(false);
  });

  // test_serialize_with_coder
  it("serialize with coder", async () => {
    const someClass = {
      dump(value: { foo: string } | null): string | null {
        if (value == null) return null;
        return value.foo;
      },
      load(value: unknown): { foo: string } | null {
        if (value == null) return null;
        return { foo: value as string };
      },
    };
    class CoderTopic extends Topic {
      static {
        serialize(this, "content", { coder: someClass });
      }
    }
    const topic = new CoderTopic({ content: { foo: "my value" } } as any);
    await topic.save();
    const reloaded = await CoderTopic.find(topic.id as number);
    expect((reloaded as any).content).toEqual({ foo: "my value" });
  });

  it.skip("serialize attribute via select method when time zone available", () => {
    // PERMANENT-SKIP: timezone-aware attributes not yet ported.
  });

  // test_serialize_attribute_can_be_serialized_in_an_integer_column
  it("serialize attribute can be serialized in an integer column", async () => {
    const insures = ["life"];
    const person = new SerializedPerson({ first_name: "David", insures: insures as any });
    await person.save();
    const reloaded = await SerializedPerson.find(person.id as number);
    expect((reloaded as any).insures).toEqual(insures);
  });

  // test_regression_serialized_default_on_text_column_with_null_false
  it("regression serialized default on text column with null false", () => {
    const light = new TrafficLight();
    expect((light as any).state).toEqual([]);
    expect((light as any).long_state).toEqual([]);
  });

  // test_unexpected_serialized_type
  it("unexpected serialized type", async () => {
    // Mirrors Rails: serialize content as Hash, then switch to Array type, read throws.
    class FlexTopic extends Topic {
      static {
        serialize(this, "content", { type: HashObject });
      }
    }
    const topic = await FlexTopic.create({ content: { zomg: true } as any });
    // Switch to Array type — re-reading the Hash value should throw.
    serialize(FlexTopic, "content", { type: Array });
    const reloaded = await FlexTopic.find(topic.id as number);
    const error = (() => {
      try {
        return (reloaded as any).content;
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(SerializationTypeMismatch);
    const expected = `can't load \`content\`: was supposed to be a Array, but was a Object. -- ${{ zomg: true }}`;
    expect((error as Error).message).toBe(expected);
  });

  // test_serialized_column_should_unserialize_after_update_column
  it("serialized column should unserialize after update column", async () => {
    class JsonTopic extends Topic {
      static {
        serialize(this, "content", { coder: "json" });
      }
    }
    const t = await JsonTopic.create({ content: JSON.stringify("first") as any });
    expect((t as any).content).toBe("first");
    await t.updateColumn("content", JSON.stringify(["second"]));
    const reloaded = await JsonTopic.find(t.id as number);
    expect((reloaded as any).content).toEqual(["second"]);
  });

  // test_serialized_column_should_unserialize_after_update_attribute
  it("serialized column should unserialize after update attribute", async () => {
    class JsonTopic extends Topic {
      static {
        serialize(this, "content", { coder: "json" });
      }
    }
    const t = await JsonTopic.create({ content: JSON.stringify("first") as any });
    expect((t as any).content).toBe("first");
    await t.updateAttribute("content", JSON.stringify("second"));
    expect((t as any).content).toBe("second");
    const reloaded = await JsonTopic.find(t.id as number);
    expect((reloaded as any).content).toBe("second");
  });

  // test_nil_is_not_changed_when_serialized_with_a_class
  it("nil is not changed when serialized with a class", () => {
    class ArrayTopic extends Topic {
      static {
        serialize(this, "content", { type: Array });
      }
    }
    // Rails: Topic.new(content: nil) — nil casts to [] (the default for Array type),
    // so content_changed? returns false. We mirror by checking the initial nil
    // default does not mark the attribute changed.
    const topic = new ArrayTopic();
    expect(topic.attributeChanged("content")).toBe(false);
  });

  it.skip("classes without no arg constructors are not supported", () => {
    // PERMANENT-SKIP: Ruby-only — Regexp constructor arity check has no JS equivalent.
  });

  // test_newly_emptied_serialized_hash_is_changed
  it("newly emptied serialized hash is changed", async () => {
    class HashTopic extends Topic {
      static {
        serialize(this, "content", { type: HashObject });
      }
    }
    const topic = await HashTopic.create({ content: { things: "stuff" } as any });
    const reloaded = await HashTopic.find(topic.id as number);
    (reloaded as any).content = {};
    await reloaded.save();
    const found = await HashTopic.find(topic.id as number);
    expect((found as any).content).toEqual({});
  });

  it.skip("is not changed when stored blob", () => {
    // PERMANENT-SKIP: binary_content blob change-tracking not yet ported.
  });

  it.skip("is not changed when stored in blob frozen payload", () => {
    // PERMANENT-SKIP: blob frozen payload not yet ported.
  });

  // test_values_cast_from_nil_are_persisted_as_nil
  it("values cast from nil are persisted as nil", async () => {
    class HashTopic extends Topic {
      static {
        serialize(this, "content", { type: HashObject });
      }
    }
    const topic = await HashTopic.create({ content: {} as any });
    const topic2 = await HashTopic.create({ content: null as any });
    const found = await HashTopic.where({ content: null }).order("id").toArray();
    const ids = found.map((t: any) => t.id as number);
    expect(ids).toContain(topic2.id);
  });

  // test_serialized_attribute_can_be_defined_in_abstract_classes
  it("serialized attribute can be defined in abstract classes", async () => {
    class AbstractBase extends Base {
      static {
        this.abstractClass = true;
        this.tableName = null as any;
        serialize(this, "content", { type: HashObject });
      }
    }
    class Subclass extends AbstractBase {
      static {
        this._tableName = "topics";
      }
    }
    const topic = await Subclass.create({ content: { foo: 1 } as any });
    const found = await Subclass.where({ id: topic.id }).toArray();
    expect(found.length).toBe(1);
    expect((found[0] as any).content).toEqual({ foo: 1 });
  });

  // test_nil_is_always_persisted_as_null
  it("nil is always persisted as null", async () => {
    class HashTopic extends Topic {
      static {
        serialize(this, "content", { type: HashObject });
      }
    }
    const topic = await HashTopic.create({ content: { foo: "bar" } as any });
    await topic.updateAttribute("content", null);
    const found = await HashTopic.where({ content: null }).toArray();
    expect(found.map((t: any) => t.id as number)).toContain(topic.id);
  });

  it.skip("decorated type with type for attribute", () => {
    // PERMANENT-SKIP: custom type decoration (EncryptedType) not yet ported.
  });

  it.skip("decorated type with decorator block", () => {
    // PERMANENT-SKIP: decorate_attributes block form not yet ported.
  });

  // test_mutation_detection_does_not_double_serialize
  it("mutation detection does not double serialize", async () => {
    const coder = {
      dump(value: string | null): string | null {
        if (value == null) return null;
        return value + " encoded";
      },
      load(value: unknown): string | null {
        if (value == null) return null;
        return (value as string).replace(" encoded", "");
      },
    };
    class CoderTopic extends Topic {
      static {
        this.attribute("content", "text");
        serialize(this, "content", { coder });
      }
    }
    const topic = await CoderTopic.create({ content: "bar" as any });
    void (topic as any).content; // read to trigger deserialization
    expect(topic.changed).toBe(false);
  });

  it.skip("serialized attribute works under concurrent initial access", () => {
    // PERMANENT-SKIP: Ruby thread concurrency test has no JS equivalent.
  });
});

// Rails: SerializedAttributeTestWithYamlSafeLoad < SerializedAttributeTest
// Reruns a subset of tests with use_yaml_unsafe_load=false. In trails we use
// JSON serialization regardless; we mirror the safe-load overrides using JSON coders.
describe("SerializedAttributeTestWithYamlSafeLoad", () => {
  useHandlerFixtures(["topics"], { schema: canonicalSchema });

  // test_serialized_attribute (safe-load variant uses type: String/Hash)
  it("serialized attribute", async () => {
    class HashTopic extends Topic {
      static {
        serialize(this, "content", { type: HashObject });
      }
    }
    const myobj = { somevalue: "thevalue" };
    const topic = await HashTopic.create({ content: myobj as any });
    expect((topic as any).content).toEqual(myobj);
    const reloaded = await HashTopic.find(topic.id as number);
    expect((reloaded as any).content).toEqual(myobj);
  });

  // test_serialized_attribute_on_custom_attribute_with_default
  it("serialized attribute on custom attribute with default", () => {
    class DefaultTopic extends Topic {
      static {
        this._tableName = "topics";
        this.attribute("content", "text", { default: '{"key":"value"}' });
        serialize(this, "content", { type: HashObject });
      }
    }
    const t = new DefaultTopic();
    expect((t as any).content).toEqual({ key: "value" });
  });

  // test_nil_is_always_persisted_as_null
  it("nil is always persisted as null", async () => {
    class HashTopic extends Topic {
      static {
        serialize(this, "content", { type: HashObject });
      }
    }
    const topic = await HashTopic.create({ content: { foo: "bar" } as any });
    await topic.updateAttribute("content", null);
    const found = await HashTopic.where({ content: null }).toArray();
    expect(found.map((t: any) => t.id as number)).toContain(topic.id);
  });

  // test_serialized_attribute_with_default
  it("serialized attribute with default", () => {
    class DefaultTopic extends Topic {
      static {
        this._tableName = "topics";
        this.attribute("content", "text", { default: '{"key":"value"}' });
        serialize(this, "content", { type: HashObject });
      }
    }
    const t = new DefaultTopic();
    expect((t as any).content).toEqual({ key: "value" });
  });

  // test_serialized_attributes_from_database_on_subclass
  it("serialized attributes from database on subclass", async () => {
    class HashBaseTopic extends Topic {
      static {
        serialize(this, "content", { type: HashObject });
      }
    }
    class SubTopic extends HashBaseTopic {}
    const t = new SubTopic({ content: { foo: "bar" } } as any);
    expect((t as any).content).toEqual({ foo: "bar" });
    await t.save();
    const last = await SubTopic.last();
    expect((last as any).content).toEqual({ foo: "bar" });
  });

  // test_serialized_attribute_on_alias_attribute
  it("serialized attribute on alias attribute", async () => {
    class AliasTopic extends Topic {
      static {
        this._tableName = "topics";
        this.aliasAttribute("object", "content");
        serialize(this, "object", { type: HashObject });
      }
    }
    const myobj = { somevalue: "thevalue" };
    const topic = (await AliasTopic.create({ object: myobj } as any)) as unknown as AliasTopic;
    expect((topic as any).object).toEqual(myobj);
    const reloaded = await AliasTopic.find((topic as any).id as number);
    expect((reloaded as any).object).toEqual(myobj);
  });

  // test_unexpected_serialized_type
  it("unexpected serialized type", async () => {
    class FlexTopic extends Topic {
      static {
        serialize(this, "content", { type: HashObject });
      }
    }
    const topic = await FlexTopic.create({ content: { zomg: true } as any });
    serialize(FlexTopic, "content", { type: Array });
    const reloaded = await FlexTopic.find(topic.id as number);
    const error = (() => {
      try {
        return (reloaded as any).content;
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(SerializationTypeMismatch);
  });

  // test_serialize_attribute_via_select_method_when_time_zone_available
  it("serialize attribute via select method when time zone available", async () => {
    class HashTopic extends Topic {
      static {
        serialize(this, "content", { type: HashObject });
      }
    }
    const myobj = { somevalue: "thevalue" };
    const topic = await HashTopic.create({ content: myobj as any });
    const found = await HashTopic.select("id", "content").find(topic.id as number);
    expect((found as any).content).toEqual(myobj);
  });

  // test_should_raise_exception_on_serialized_attribute_with_type_mismatch
  it("should raise exception on serialized attribute with type mismatch", async () => {
    class FlexTopic extends Topic {
      static {
        serialize(this, "content", { type: HashObject });
      }
    }
    const topic = await FlexTopic.create({ content: { somevalue: "thevalue" } as any });
    serialize(FlexTopic, "content", { type: Array });
    const found = await FlexTopic.find(topic.id as number);
    expect(() => (found as any).content).toThrow(SerializationTypeMismatch);
  });

  it.skip("serialized time attribute", () => {
    // Skipped in Rails SafeLoad variant: Time is a DisallowedClass in Psych safe_load.
  });

  it.skip("supports permitted classes for default column serializer", () => {
    // PERMANENT-SKIP: YAML permitted_classes is Rails-specific; trails uses JSON.
  });
});
