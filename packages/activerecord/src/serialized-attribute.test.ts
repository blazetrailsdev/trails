import {
  ArgumentError,
  Hash,
  Module,
  Struct,
  hashAref,
  hashAset,
  include,
  rbCClass,
  rbCString,
  rbCSymbol,
  rbEqual,
  rbInspect,
  rbModConstSet,
  rbObjClass,
  rbObjDup,
  rbObjFrozenP,
  rbStrSNew,
  registerConstant,
} from "@blazetrails/ruby-compat";
import { Time as RubyTime } from "@blazetrails/date";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { assertRaises } from "@blazetrails/activesupport";
import { MessageEncryptor } from "@blazetrails/activesupport/message-encryptor";
import { assertNoQueries } from "./testing/query-assertions.js";
import { MissingAttributeError, Mutable, StringType, ValueType } from "@blazetrails/activemodel";
import { Base, SerializationTypeMismatch, registerModel } from "./index.js";
import { JSON as CodersJSON } from "./coders/json.js";
import { YAMLColumn } from "./coders/yaml-column.js";
import * as Type from "./type.js";
import { Text } from "./type/text.js";

import { fixtures } from "./test-helpers/use-fixtures.js";
import { withTimezoneConfig } from "./test-helper.js";
import { SerializedPerson } from "./test-helpers/models/person.js";
import { TrafficLight } from "./test-helpers/models/traffic-light.js";
import {
  setUseYamlUnsafeLoad,
  setYamlColumnPermittedClasses,
  useYamlUnsafeLoad,
  yamlColumnPermittedClasses,
} from "./active-record.js";

const SerializedAttributeTest = new Module();
registerConstant("SerializedAttributeTest", SerializedAttributeTest);

const MyObject = rbModConstSet(
  SerializedAttributeTest,
  "MyObject",
  Struct.new("attribute1", "attribute2"),
);

class Topic extends Base {
  declare id: number;
  declare content: any;
  declare binary_content: any;
  declare group: any;

  static {
    registerModel(rbModConstSet(SerializedAttributeTest, "Topic", this));
    this.serialize("content");
  }
}

class ImportantTopic extends Topic {
  declare important: any;

  static {
    registerModel(rbModConstSet(SerializedAttributeTest, "ImportantTopic", this));
    this.serialize("important", { type: Hash });
  }
}

class ClassifiedTopic extends Topic {
  declare important: any;

  static {
    registerModel(rbModConstSet(SerializedAttributeTest, "ClassifiedTopic", this));
    this.serialize("important", { type: rbCClass });
  }
}

class FrozenCoder extends YAMLColumn {
  override dump(obj: unknown): string | null {
    return super.dump(obj);
  }
}

class EncryptedType extends Text {
  readonly subtype: ValueType;
  readonly encryptor: MessageEncryptor;

  constructor({ subtype = new StringType() }: { subtype?: ValueType } = {}) {
    super();

    this.subtype = subtype;
    this.encryptor = new MessageEncryptor("abcd".repeat(8));
  }

  override serialize(value: unknown): unknown {
    const cleartext = this.subtype.serialize(value);
    return cleartext == null ? null : this.encryptor.encryptAndSign(cleartext);
  }

  override deserialize(ciphertext: unknown): string | null {
    if (ciphertext == null) return null;
    const cleartext = this.encryptor.decryptAndVerify(ciphertext as string);
    return this.subtype.deserialize(cleartext) as string | null;
  }

  override isChangedInPlace(old: unknown, newValue: unknown): boolean {
    if (old == null) {
      return newValue != null;
    } else {
      return this.deserialize(old) !== newValue;
    }
  }
}
include(EncryptedType, Mutable);

describe("SerializedAttributeTest", () => {
  const { posts } = fixtures(["topics", "posts"]);

  let yamlColumnPermittedClassesDefault: unknown[];

  beforeEach(() => {
    setUseYamlUnsafeLoad(true);
    yamlColumnPermittedClassesDefault = yamlColumnPermittedClasses();
  });
  afterEach(() => {
    Topic.serialize("content");
    setYamlColumnPermittedClasses(yamlColumnPermittedClassesDefault);
  });

  it("serialize does not eagerly load columns", async () => {
    Topic.resetColumnInformation();
    await assertNoQueries(false, () => {
      Topic.serialize("content");
    });
  });

  it("serialized attribute", async () => {
    Topic.serialize("content", { type: MyObject });

    const myobj = new MyObject("value1", "value2");
    const topic = await Topic.create({ content: myobj });
    expect(topic.content).toEqual(myobj);

    await topic.reload();
    expect(topic.content).toEqual(myobj);
  });

  it("serialized attribute on alias attribute", async () => {
    const klass = class extends Base {
      declare object: any;

      static {
        this.tableName = Topic.tableName;
        this.aliasAttribute("object", "content");
        this.serialize("object", { type: MyObject });
      }
    };

    const myobj = new MyObject("value1", "value2");
    const topic = await klass.createBang({ object: myobj });
    expect(topic.object).toEqual(myobj);

    await topic.reload();
    expect(topic.object).toEqual(myobj);
  });

  it("serialized attribute with default", () => {
    const klass = class extends Base {
      declare content: any;

      static {
        this.tableName = Topic.tableName;
        this.serialize("content", { type: Hash, default: { key: "value" } });
      }
    };

    const t = new klass();
    expect(t.content).toEqual({ key: "value" });
  });

  it("serialized attribute on custom attribute with default", () => {
    const klass = class extends Base {
      declare content: any;

      static {
        this.tableName = Topic.tableName;
        this.attribute("content", undefined, { default: { key: "value" } });
        this.serialize("content", { type: Hash });
      }
    };

    const t = new klass();
    expect(t.content).toEqual({ key: "value" });
  });

  it("serialized attribute in base class", async () => {
    Topic.serialize("content", { type: Hash });

    const hash = { content1: "value1", content2: "value2" };
    const importantTopic = await ImportantTopic.create({ content: hash });
    expect(importantTopic.content).toEqual(hash);

    await importantTopic.reload();
    expect(importantTopic.content).toEqual(hash);
  });

  it("serialized attributes from database on subclass", async () => {
    Topic.serialize("content", { type: Hash });

    let t = new ImportantTopic({ content: { foo: "bar" } });
    expect(t.content).toEqual({ foo: "bar" });
    await t.saveBang();
    t = (await ImportantTopic.last())!;
    expect(t.content).toEqual({ foo: "bar" });
  });

  it("serialized attribute calling dup method", () => {
    Topic.serialize("content", { coder: JSON });

    const orig = new Topic({ content: { foo: "bar" } });
    const clone = orig.dup();
    expect(clone.content).toEqual(orig.content);
  });

  it("serialized json attribute returns unserialized value", async () => {
    Topic.serialize("content", { coder: JSON });
    const myPost = posts("welcome");

    const t = new Topic({ content: myPost });
    await t.saveBang();
    await t.reload();

    expect(t.content).toBeInstanceOf(Object);
    expect(t.content["id"]).toEqual(myPost.id);
    expect(t.content["title"]).toEqual(myPost.title);
  });

  // eslint-disable-next-line blazetrails/test-fixture-parity -- fixture data unused; the row is inserted by raw SQL
  it("json read legacy null", async () => {
    Topic.serialize("content", { coder: JSON });

    const id = await (
      await Topic.leaseConnection()
    ).insert("INSERT INTO topics (content) VALUES('null')");
    const t = await Topic.find(id);

    expect(t.content).toBeNull();
  });

  // eslint-disable-next-line blazetrails/test-fixture-parity -- fixture data unused; the row is inserted by raw SQL
  it("json read db null", async () => {
    Topic.serialize("content", { coder: JSON });

    const id = await (
      await Topic.leaseConnection()
    ).insert("INSERT INTO topics (content) VALUES(NULL)");
    const t = await Topic.find(id);

    expect(t.content).toBeNull();
  });

  it("serialized attribute declared in subclass", async () => {
    const hash = { important1: "value1", important2: "value2" };
    const importantTopic = await ImportantTopic.create({ important: hash });
    expect(importantTopic.important).toEqual(hash);

    await importantTopic.reload();
    expect(importantTopic.important).toEqual(hash);
    expect(importantTopic.readAttribute("important")).toEqual(hash);
  });

  it("serialized time attribute", async () => {
    const myobj = RubyTime.local(2008, 1, 1, 1, 0);
    const topic = await (await Topic.create({ content: myobj })).reload();
    expect(topic.content).toEqual(myobj);
  });

  it("serialized string attribute", async () => {
    const myobj = "Yes";
    const topic = await (await Topic.create({ content: myobj })).reload();
    expect(topic.content).toEqual(myobj);
  });

  it("serialized class attribute", async () => {
    setYamlColumnPermittedClasses([...yamlColumnPermittedClasses(), rbCClass]);

    const topic = await (await ClassifiedTopic.create({ important: rbCSymbol })).reload();
    expect(topic.important).toEqual(rbCSymbol);
    expect(await ClassifiedTopic.where({ important: rbCSymbol })).not.toHaveLength(0);
  });

  it("serialized class does not become frozen", async () => {
    setYamlColumnPermittedClasses([...yamlColumnPermittedClasses(), rbCClass]);

    expect(rbObjFrozenP(rbCSymbol)).toBeFalsy();
    await ClassifiedTopic.create({ important: rbCSymbol });
    expect(await ClassifiedTopic.where({ important: rbCSymbol })).not.toHaveLength(0);
    expect(rbObjFrozenP(rbCSymbol)).toBeFalsy();
  });

  it("nil serialized attribute without class constraint", () => {
    const topic = new Topic();
    expect(topic.content).toBeNull();
  });

  it("nil not serialized without class constraint", async () => {
    expect(await new Topic({ content: null }).save()).toBeTruthy();
    expect(await Topic.where({ content: null }).count()).toEqual(1);
  });

  it("nil not serialized with class constraint", async () => {
    Topic.serialize("content", { type: Hash });
    expect(await new Topic({ content: null }).save()).toBeTruthy();
    expect(await Topic.where({ content: null }).count()).toEqual(1);
  });

  it("serialized attribute should raise exception on assignment with wrong type", async () => {
    Topic.serialize("content", { type: Hash });
    await assertRaises([SerializationTypeMismatch], {}, () => {
      new Topic({ content: "string" });
    });
  });

  it("should raise exception on serialized attribute with type mismatch", async () => {
    const myobj = new MyObject("value1", "value2");
    const topic = new Topic({ content: myobj });
    expect(await topic.save()).toBeTruthy();
    Topic.serialize("content", { type: Hash });
    const found = await Topic.find(topic.id);
    await assertRaises([SerializationTypeMismatch], {}, () => found.content);
  });

  it("serialized attribute with class constraint", async () => {
    const settings = { color: "blue" };
    Topic.serialize("content", { type: Hash });
    const topic = new Topic({ content: settings });
    expect(await topic.save()).toBeTruthy();
    expect((await Topic.find(topic.id)).content).toEqual(settings);
  });

  it("where by serialized attribute with array", async () => {
    const settings = [{ color: "green" }];
    Topic.serialize("content", { type: Array });
    const topic = await Topic.createBang({ content: settings });
    expect((await Topic.where({ content: settings }).take())!.equals(topic)).toBe(true);
  });

  it("where by serialized attribute with hash", async () => {
    const settings = { color: "green" };
    Topic.serialize("content", { type: Hash });
    const topic = await Topic.createBang({ content: settings });
    expect((await Topic.where({ content: settings }).take())!.equals(topic)).toBe(true);
  });

  it("where by serialized attribute with hash in array", async () => {
    const settings = { color: "green" };
    Topic.serialize("content", { type: Hash });
    const topic = await Topic.createBang({ content: settings });
    expect(
      (await Topic.where({ content: [settings, { herring: "red" }] }).take())!.equals(topic),
    ).toBe(true);
  });

  it("serialized default class", async () => {
    Topic.serialize("content", { type: Hash });
    const topic = new Topic();
    expect(rbObjClass(topic.content)).toEqual(Hash);
    expect(rbObjClass(topic.readAttribute("content"))).toEqual(Hash);
    hashAset(topic.content, "beer", "MadridRb");
    expect(await topic.save()).toBeTruthy();
    await topic.reload();
    expect(rbObjClass(topic.content)).toEqual(Hash);
    expect(hashAref(topic.content, "beer")).toEqual("MadridRb");
  });

  it("serialized no default class for object", () => {
    const topic = new Topic();
    expect(topic.content).toBeNull();
  });

  it("serialized boolean value true", async () => {
    let topic = new Topic({ content: true });
    expect(await topic.save()).toBeTruthy();
    topic = await topic.reload();
    expect(topic.content).toEqual(true);
  });

  it("serialized boolean value false", async () => {
    let topic = new Topic({ content: false });
    expect(await topic.save()).toBeTruthy();
    topic = await topic.reload();
    expect(topic.content).toEqual(false);
  });

  it("serialize with coder", async () => {
    const someClass = class extends Struct.new("foo") {
      static dump(value: { foo: unknown }): unknown {
        return value.foo;
      }

      static load(value: unknown): unknown {
        return new this(value);
      }
    };

    Topic.serialize("content", { coder: someClass });
    const topic = new Topic({ content: new someClass("my value") });
    await topic.saveBang();
    await topic.reload();
    expect(topic.content).toBeInstanceOf(someClass);
    expect(topic.content).toEqual(new someClass("my value"));
  });

  it("serialize attribute via select method when time zone available", async () => {
    await withTimezoneConfig({ awareAttributes: true }, async () => {
      Topic.serialize("content", { type: MyObject });

      const myobj = new MyObject("value1", "value2");
      const topic = await Topic.create({ content: myobj });

      expect((await Topic.select("content").find(topic.id)).content).toEqual(myobj);
      const found = await Topic.select("id").find(topic.id);
      await assertRaises([MissingAttributeError], {}, () => found.content);
    });
  });

  it("serialize attribute can be serialized in an integer column", async () => {
    const insures = ["life"];
    let person = new SerializedPerson({ first_name: "David", insures });
    expect(await person.save()).toBeTruthy();
    person = await person.reload();
    expect(person.insures).toEqual(insures);
  });

  it("regression serialized default on text column with null false", () => {
    const light = new TrafficLight();
    expect(light.state).toEqual([]);
    expect(light.long_state).toEqual([]);
  });

  it("unexpected serialized type", async () => {
    Topic.serialize("content", { type: Hash });
    const topic = await Topic.createBang({ content: { zomg: true } });

    Topic.serialize("content", { type: Array });

    await topic.reload();
    const error = await assertRaises([SerializationTypeMismatch], {}, () => topic.content);
    const expected = `can't load \`content\`: was supposed to be a Array, but was a Hash. -- ${rbInspect({ zomg: true })}`;
    expect(String(error.message)).toEqual(expected);
  });

  it("serialized column should unserialize after update column", async () => {
    const t = await Topic.create({ content: "first" });
    expect(t.content).toEqual("first");

    await t.updateColumn("content", ["second"]);
    expect(t.content).toEqual(["second"]);
    expect((await t.reload()).content).toEqual(["second"]);
  });

  it("serialized column should unserialize after update attribute", async () => {
    const t = await Topic.create({ content: "first" });
    expect(t.content).toEqual("first");

    await t.updateAttribute("content", "second");
    expect(t.content).toEqual("second");
    expect((await t.reload()).content).toEqual("second");
  });

  it("nil is not changed when serialized with a class", () => {
    Topic.serialize("content", { type: Array });

    const topic = new Topic({ content: null });

    expect(topic.attributeChanged("content")).toBeFalsy();
  });

  it("classes without no arg constructors are not supported", async () => {
    await assertRaises([ArgumentError], {}, () => {
      Topic.serialize("content", { type: RegExp });
    });
  });

  it("newly emptied serialized hash is changed", async () => {
    Topic.serialize("content", { type: Hash });
    const topic = await Topic.create({ content: { things: "stuff" } });
    delete topic.content["things"];
    await topic.saveBang();
    await topic.reload();

    expect(topic.content).toEqual({});
  });

  it("is not changed when stored blob", async () => {
    Topic.serialize("binary_content", { type: Array });
    Topic.serialize("content", { type: Array });

    const value = ["Fée"];
    const model = await Topic.createBang({ binary_content: value, content: value });
    await model.reload();

    model.binary_content = value;
    expect(model.attributeChanged("binary_content")).toBeFalsy();

    model.content = value;
    expect(model.attributeChanged("content")).toBeFalsy();
  });

  it("is not changed when stored in blob frozen payload", async () => {
    Topic.serialize("binary_content", { coder: new FrozenCoder("binary_content", Array) });
    Topic.serialize("content", { coder: new FrozenCoder("content", Array) });

    const value = ["Fée"];
    const model = await Topic.createBang({ binary_content: value, content: value });
    await model.reload();

    model.content = value;
    expect(model.attributeChanged("content")).toBeFalsy();
  });

  it("values cast from nil are persisted as nil", async () => {
    Topic.serialize("content", { type: Hash });
    const topic = await Topic.createBang({ content: {} });
    const topic2 = await Topic.createBang({ content: null });

    const found = (await Topic.where({ content: null })).sort((a, b) => a.id - b.id);
    expect(found.map((t) => t.equals([topic, topic2][found.indexOf(t)]))).toEqual([true, true]);
  });

  it("serialized attribute can be defined in abstract classes", async () => {
    const klass = class extends Base {
      static {
        this.abstractClass = true;
        this.tableName = null;
        this.serialize("content", { type: Hash });
      }
    };

    const subclass = class extends klass {
      static {
        this.tableName = "topics";
      }
    };

    subclass.defineAttributeMethods();

    const topic = await subclass.createBang({ content: { foo: 1 } });
    const found = await subclass.where({ content: { foo: 1 } });
    expect(found.map((t) => t.equals(topic))).toEqual([true]);
  });

  it("nil is always persisted as null", async () => {
    Topic.serialize("content", { type: Hash });

    const topic = await Topic.createBang({ content: { foo: "bar" } });
    await topic.updateAttribute("content", null);
    const found = await Topic.where({ content: null });
    expect(found.map((t) => t.equals(topic))).toEqual([true]);
  });

  it("decorated type with type for attribute", async () => {
    const oldRegistry = Type.registry();
    Type.setRegistry(rbObjDup(Type.registry()));
    try {
      Type.register("encrypted", EncryptedType);

      const klass = class extends Base {
        declare content: any;

        static {
          this.tableName = Topic.tableName;
          this.store("content", { coder: CodersJSON });
          this.attribute("content", "encrypted", { subtype: this.typeForAttribute("content") });
        }
      };

      const topic = await klass.createBang({ content: { trial: true } });

      expect(rbEqual(topic.content, { trial: true })).toBe(true);
    } finally {
      Type.setRegistry(oldRegistry);
    }
  });

  it("decorated type with decorator block", async () => {
    const klass = class extends Base {
      declare content: any;

      static {
        this.tableName = Topic.tableName;
        this.store("content", { coder: CodersJSON });
        this.decorateAttributes(["content"], (_name, type) => {
          return new EncryptedType({ subtype: type! });
        });
      }
    };

    const topic = await klass.createBang({ content: { trial: true } });
    expect(rbEqual(topic.content, { trial: true })).toBe(true);
  });

  it("mutation detection does not double serialize", async () => {
    const coder = {
      dump(value: string | null): string | null {
        if (value == null) return null;
        return value + " encoded";
      },
      load(value: string | null): string | null {
        if (value == null) return null;
        return value.replaceAll(" encoded", "");
      },
    };
    const typeClass = class extends ValueType {
      override serialize(value: unknown): unknown {
        if (value == null) return null;
        return (value as string) + " serialized";
      }

      override deserialize(value: unknown): unknown {
        if (value == null) return null;
        return (value as string).replaceAll(" serialized", "");
      }
    };
    include(typeClass, Mutable);
    const type = new typeClass();
    const model = class extends Topic {
      declare foo: any;

      static {
        this.attribute("foo", type);
        this.serialize("foo", { coder });
      }
    };

    const topic = await model.createBang({ foo: "bar" });
    void topic.foo;
    expect(topic.isChanged).toBeFalsy();
  });

  it("serialized attribute works under concurrent initial access", async () => {
    const model = (() => class extends Topic {})();

    const topic = await model.createBang();
    await topic.update({ group: "1" });

    model.serialize("group", { coder: JSON });
    model.resetColumnInformation();

    const threads = Array.from({ length: 4 }, async () => {
      return (await topic.reload()).group;
    });

    expect(await Promise.all(threads)).toEqual(Array(threads.length).fill(1));
  });
});

describe("SerializedAttributeTestWithYamlSafeLoad", () => {
  fixtures(["topics", "posts"]);

  let useYamlUnsafeLoadWas: boolean;
  let yamlColumnPermittedClassesDefault: unknown[];

  beforeEach(() => {
    useYamlUnsafeLoadWas = useYamlUnsafeLoad();
    yamlColumnPermittedClassesDefault = yamlColumnPermittedClasses();
    setUseYamlUnsafeLoad(false);
  });
  afterEach(() => {
    Topic.serialize("content");
    setYamlColumnPermittedClasses(yamlColumnPermittedClassesDefault);
    setUseYamlUnsafeLoad(useYamlUnsafeLoadWas);
  });

  it("serialized attribute", async () => {
    Topic.serialize("content", { type: rbCString });

    const myobj = rbStrSNew("value1");
    const topic = await Topic.create({ content: myobj });
    expect(topic.content).toEqual(myobj);

    await topic.reload();
    expect(topic.content).toEqual(myobj);
  });

  it("serialized attribute on custom attribute with default", () => {
    const klass = class extends Base {
      declare content: any;

      static {
        this.tableName = Topic.tableName;
        this.attribute("content", undefined, { default: { key: "value" } });
        this.serialize("content", { type: Hash });
      }
    };

    const t = new klass();
    expect(t.content).toEqual({ key: "value" });
  });

  it("nil is always persisted as null", async () => {
    Topic.serialize("content", { type: Hash });

    const topic = await Topic.createBang({ content: { foo: "bar" } });
    await topic.updateAttribute("content", null);
    const found = await Topic.where({ content: null });
    expect(found.map((t) => t.equals(topic))).toEqual([true]);
  });

  it("serialized attribute with default", () => {
    const klass = class extends Base {
      declare content: any;

      static {
        this.tableName = Topic.tableName;
        this.serialize("content", { type: Hash, default: { key: "value" } });
      }
    };

    const t = new klass();
    expect(t.content).toEqual({ key: "value" });
  });

  it("serialized attributes from database on subclass", async () => {
    Topic.serialize("content", { type: Hash });

    let t = new ImportantTopic({ content: { foo: "bar" } });
    expect(t.content).toEqual({ foo: "bar" });
    await t.saveBang();
    t = (await ImportantTopic.last())!;
    expect(t.content).toEqual({ foo: "bar" });
  });

  it("serialized attribute on alias attribute", async () => {
    const klass = class extends Base {
      declare object: any;

      static {
        this.tableName = Topic.tableName;
        this.aliasAttribute("object", "content");
        this.serialize("object", { type: Hash });
      }
    };

    const myobj = { somevalue: "thevalue" };
    const topic = await klass.createBang({ object: myobj });
    expect(topic.object).toEqual(myobj);

    await topic.reload();
    expect(topic.object).toEqual(myobj);
  });

  it("unexpected serialized type", async () => {
    Topic.serialize("content", { type: Hash });
    const topic = await Topic.createBang({ content: { zomg: true } });

    Topic.serialize("content", { type: Array });

    await topic.reload();
    const error = await assertRaises([SerializationTypeMismatch], {}, () => topic.content);
    const expected = `can't load \`content\`: was supposed to be a Array, but was a Hash. -- ${rbInspect({ zomg: true })}`;
    expect(String(error.message)).toEqual(expected);
  });

  it("serialize attribute via select method when time zone available", async () => {
    await withTimezoneConfig({ awareAttributes: true }, async () => {
      Topic.serialize("content", { type: Hash });

      const myobj = { somevalue: "thevalue" };
      const topic = await Topic.create({ content: myobj });

      expect((await Topic.select("content").find(topic.id)).content).toEqual(myobj);
      const found = await Topic.select("id").find(topic.id);
      await assertRaises([MissingAttributeError], {}, () => found.content);
    });
  });

  it("should raise exception on serialized attribute with type mismatch", async () => {
    const myobj = { somevalue: "thevalue" };
    const topic = new Topic({ content: myobj });
    expect(await topic.save()).toBeTruthy();
    Topic.serialize("content", { type: rbCString });
    const found = await Topic.find(topic.id);
    await assertRaises([SerializationTypeMismatch], {}, () => found.content);
  });

  it.skip("serialized time attribute", () => {});

  it("supports permitted classes for default column serializer", async () => {
    Topic.serialize("content", { yaml: { permittedClasses: [RubyTime] } });
    const topic = new Topic({ content: RubyTime.now() });
    expect(await topic.save()).toBeTruthy();
  });
});
