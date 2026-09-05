import { it, expect, beforeEach, afterEach } from "vitest";
import { Temporal } from "@blazetrails/date";
import { stringify as yamlStringify, parse as yamlParse } from "@blazetrails/activesupport/yaml";
import { Base } from "../base.js";
import { ColumnNotSerializableError } from "../attribute-methods/serialization.js";
import { SchemaDumper } from "../schema-dumper.js";
import { pp } from "../pretty-print.js";
import type { AbstractAdapter } from "../connection-adapters/abstract-adapter.js";
import type { Table } from "../connection-adapters/abstract/schema-definitions.js";

export interface JSONSharedTestCasesHost {
  columnType: string;
  insertStatementPerDatabase?: (values: string) => string;
}

export class JsonDataType extends Base {
  static {
    this.tableName = "json_data_type";
    this.storeAccessor("settings", "resolution");
  }
}

type JsonRecord = InstanceType<typeof JsonDataType> & Record<string, unknown>;

export function jsonSharedTestCases(host: JSONSharedTestCasesHost): void {
  const columnType = host.columnType;

  let connection: AbstractAdapter;

  beforeEach(async () => {
    connection = await Base.leaseConnection();
    await klass().loadSchema();
  });

  afterEach(async () => {
    await connection.dropTable("json_data_type", { ifExists: true });
    void klass().resetColumnInformation();
  });

  it("test_column", async () => {
    const column = klass().columnsHash()["payload"];
    expect(column.type).toBe(columnType);
    await assertTypeMatch(columnType, column.sqlType);

    const type = klass().typeForAttribute("payload")!;
    expect(type.isBinary()).toBe(false);
  });

  it("test_change_table_supports_json", async () => {
    await connection.changeTable("json_data_type", async (t: Table) => {
      await (t as unknown as Record<string, (name: string) => Promise<void>>)[columnType]("users");
    });
    await klass().resetColumnInformation();
    await klass().loadSchema();
    const column = klass().columnsHash()["users"];
    expect(column.type).toBe(columnType);
    await assertTypeMatch(columnType, column.sqlType);
  });

  it("test_schema_dumping", async () => {
    const output = await SchemaDumper.dumpTableSchema(connection, "json_data_type");
    expect(output).toMatch(new RegExp(`t\\.${columnType}\\(\\s*"settings"`));
  });

  it("test_cast_value_on_write", async () => {
    const payload = { string: "foo", symbol: "bar" };
    const x = klass().new({ payload }) as JsonRecord;
    expect((x.attributeBeforeTypeCast as (attrName: string) => unknown)("payload")).toBe(payload);
    expect(x.payload).not.toBe(payload);
    expect(x.payload).toEqual({ string: "foo", symbol: "bar" });
    await x.saveBang();
    expect((await x.reload()).payload).toEqual({ string: "foo", symbol: "bar" });
  });

  it("test_type_cast_json", () => {
    const type = klass().typeForAttribute("payload")!;

    const data = '{"a_key":"a_value"}';
    const hash = type.deserialize(data);
    expect(hash).toEqual({ a_key: "a_value" });
    expect(type.deserialize(data)).toEqual({ a_key: "a_value" });

    expect(type.deserialize("{}")).toEqual({});
    expect(type.deserialize('{"key": null}')).toEqual({ key: null });
    expect(type.deserialize('{"c":"}", "\\"a\\"":"b \\"a b"}')).toEqual({
      c: "}",
      '"a"': 'b "a b',
    });
  });

  it("test_rewrite", async () => {
    await connection.execute(insertStatementPerDatabase('{"k":"v"}'));
    const x = (await klass().first()) as JsonRecord;
    x.payload = { "\"a'": "b" };
    expect(await x.saveBang()).toBeTruthy();
  });

  it("test_select", async () => {
    await connection.execute(insertStatementPerDatabase('{"k":"v"}'));
    const x = (await klass().first()) as JsonRecord;
    expect(x.payload).toEqual({ k: "v" });
  });

  it("test_select_multikey", async () => {
    await connection.execute(insertStatementPerDatabase('{"k1":"v1", "k2":"v2", "k3":[1,2,3]}'));
    const x = (await klass().first()) as JsonRecord;
    expect(x.payload).toEqual({ k1: "v1", k2: "v2", k3: [1, 2, 3] });
  });

  it("test_null_json", async () => {
    await connection.execute(insertStatementPerDatabase("null"));
    const x = (await klass().first()) as JsonRecord;
    expect(x.payload).toBeNull();
  });

  it("test_select_nil_json_after_create", async () => {
    const json = (await klass().createBang({ payload: null })) as JsonRecord;
    const x = await klass().where({ payload: null }).first();
    expect(json.equals(x)).toBe(true);
  });

  it("test_select_nil_json_after_update", async () => {
    const json = (await klass().createBang({ payload: "foo" })) as JsonRecord;
    let x = await klass().where({ payload: null }).first();
    expect(x).toBeNull();

    await json.update({ payload: null });
    x = await klass().where({ payload: null }).first();
    expect((await json.reload()).equals(x)).toBe(true);
  });

  it("test_select_array_json_value", async () => {
    await connection.execute(insertStatementPerDatabase('["v0",{"k1":"v1"}]'));
    const x = (await klass().first()) as JsonRecord;
    expect(x.payload).toEqual(["v0", { k1: "v1" }]);
  });

  it("test_rewrite_array_json_value", async () => {
    await connection.execute(insertStatementPerDatabase('["v0",{"k1":"v1"}]'));
    const x = (await klass().first()) as JsonRecord;
    x.payload = ["v1", { k2: "v2" }, "v3"];
    expect(await x.saveBang()).toBeTruthy();
  });

  it("test_with_store_accessors", async () => {
    let x = klass().new({ resolution: "320×480" }) as JsonRecord;
    expect(x.resolution).toBe("320×480");

    await x.saveBang();
    x = (await klass().first()) as JsonRecord;
    expect(x.resolution).toBe("320×480");

    x.resolution = "640×1136";
    await x.saveBang();

    x = (await klass().first()) as JsonRecord;
    expect(x.resolution).toBe("640×1136");
  });

  it("test_duplication_with_store_accessors", () => {
    const x = klass().new({ resolution: "320×480" }) as JsonRecord;
    expect(x.resolution).toBe("320×480");

    const y = x.dup();
    expect(y.resolution).toBe("320×480");
  });

  it("test_yaml_round_trip_with_store_accessors", () => {
    const x = klass().new({ resolution: "320×480" }) as JsonRecord;
    expect(x.resolution).toBe("320×480");

    const payload = yamlStringify(x.serializableHash());
    const y = klass().new(yamlParse(payload) as Record<string, unknown>) as JsonRecord;
    expect(y.resolution).toBe("320×480");
  });

  it("test_changes_in_place", async () => {
    const json = klass().new() as JsonRecord;
    expect(json.isChanged).toBe(false);

    json.payload = { one: "two" };
    expect(json.isChanged).toBe(true);
    expect((json.payloadChanged as () => boolean)()).toBe(true);

    await json.saveBang();
    expect(json.isChanged).toBe(false);

    (json.payload as Record<string, string>)["three"] = "four";
    expect((json.payloadChanged as () => boolean)()).toBe(true);

    await json.saveBang();
    await json.reload();

    expect(json.payload).toEqual({ one: "two", three: "four" });
    expect(json.isChanged).toBe(false);
  });

  it.skip("test_changes_in_place_ignores_key_order", async () => {
    const json = klass().new() as JsonRecord;
    expect(json.isChanged).toBe(false);

    json.payload = { three: "four", one: "two" };
    await json.saveBang();
    await json.reload();

    json.payload = { three: "four", one: "two" };
    expect(json.isChanged).toBe(false);

    json.payload = [
      { three: "four", one: "two" },
      { seven: "eight", five: "six" },
    ];
    await json.saveBang();
    await json.reload();

    json.payload = [
      { three: "four", one: "two" },
      { seven: "eight", five: "six" },
    ];
    expect(json.isChanged).toBe(false);
  });

  it("test_changes_in_place_with_ruby_object", async () => {
    const time = Temporal.Now.instant();
    const json = (await klass().createBang({ payload: time })) as JsonRecord;

    await json.reload();
    expect(json.isChanged).toBe(false);

    json.payload = time;
    expect(json.isChanged).toBe(false);
  });

  it("test_assigning_string_literal", async () => {
    const json = (await klass().createBang({ payload: "foo" })) as JsonRecord;
    expect(json.payload).toBe("foo");
  });

  it("test_assigning_number", async () => {
    const json = (await klass().createBang({ payload: 1.234 })) as JsonRecord;
    expect(json.payload).toBe(1.234);
  });

  it("test_assigning_boolean", async () => {
    const json = (await klass().createBang({ payload: true })) as JsonRecord;
    expect(json.payload).toBe(true);
  });

  it("test_not_compatible_with_serialize_json", async () => {
    class NewKlass extends klass() {}
    NewKlass.serialize("payload", { coder: JSON });
    expect(() => new NewKlass()).toThrow(ColumnNotSerializableError);
  });

  class MySettings {
    constructor(private readonly hash: Record<string, unknown>) {}
    toHash(): Record<string, unknown> {
      return this.hash;
    }
    static load(hash: unknown): MySettings {
      return new MySettings(hash as Record<string, unknown>);
    }
    static dump(object: unknown): unknown {
      return (object as MySettings).toHash();
    }
  }

  it("test_json_with_serialized_attributes", async () => {
    class NewKlass extends klass() {}
    NewKlass.serialize("settings", { coder: MySettings });
    await NewKlass.loadSchema();

    await NewKlass.createBang({ settings: new MySettings({ one: "two" }) });
    const record = (await NewKlass.first()) as JsonRecord;

    expect(record.settings).toBeInstanceOf(MySettings);
    expect((record.settings as MySettings).toHash()).toEqual({ one: "two" });

    record.settings = new MySettings({ three: "four" });
    await record.saveBang();

    expect(((await record.reload()).settings as MySettings).toHash()).toEqual({ three: "four" });
  });

  class JsonDataTypeWithFilter extends Base {
    static {
      this.tableName = "json_data_type";
      this.attribute("payload", "json");
    }

    static override get filterAttributes(): (
      | string
      | RegExp
      | ((key: string, value: unknown) => unknown)
    )[] {
      return [...super.filterAttributes, "password"];
    }
  }

  it("test_pretty_print", async () => {
    await JsonDataTypeWithFilter.loadSchema();
    const x = (await JsonDataTypeWithFilter.createBang({ payload: {} })) as JsonRecord;
    (x.payload as Record<number, string>)[11] = "foo";
    let string = "";
    await pp(x, { write: (s: string) => (string += s) });
    expect(string).toBeTruthy();
  });

  function klass(): typeof JsonDataType {
    return JsonDataType;
  }

  const insertStatementPerDatabase =
    host.insertStatementPerDatabase ??
    ((values: string) => `insert into json_data_type (payload) VALUES ('${values}')`);

  async function assertTypeMatch(type: string, sqlType: string | undefined): Promise<void> {
    const nativeType = (
      (await Base.leaseConnection()).nativeDatabaseTypes()[type] as { name: string }
    ).name;
    expect(sqlType ?? "").toMatch(new RegExp(`^${nativeType}\\b`));
  }
}
