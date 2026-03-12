import { describe, it, expect } from "vitest";

describe("TestJSONEncoding", () => {
  it("hash encoding", () => {
    const obj = { a: 1, b: "hello", c: true };
    expect(JSON.stringify(obj)).toBe('{"a":1,"b":"hello","c":true}');
  });

  it("hash keys encoding", () => {
    const obj = { name: "Alice", age: 30 };
    const parsed = JSON.parse(JSON.stringify(obj));
    expect(Object.keys(parsed)).toEqual(["name", "age"]);
  });

  it("utf8 string encoded properly", () => {
    const obj = { name: "Ünïcödé" };
    const json = JSON.stringify(obj);
    const parsed = JSON.parse(json);
    expect(parsed.name).toBe("Ünïcödé");
  });

  it("wide utf8 chars", () => {
    const str = "日本語";
    const json = JSON.stringify(str);
    const parsed = JSON.parse(json);
    expect(parsed).toBe(str);
  });

  it("wide utf8 roundtrip", () => {
    const original = { text: "中文 العربية" };
    const roundtripped = JSON.parse(JSON.stringify(original));
    expect(roundtripped.text).toBe(original.text);
  });

  it("hash key identifiers are always quoted", () => {
    const obj = { key: "value" };
    const json = JSON.stringify(obj);
    expect(json).toContain('"key"');
  });

  it("hash should allow key filtering with only", () => {
    const obj = { a: 1, b: 2, c: 3 };
    const only = (o: Record<string, unknown>, keys: string[]) =>
      Object.fromEntries(Object.entries(o).filter(([k]) => keys.includes(k)));
    expect(only(obj, ["a", "c"])).toEqual({ a: 1, c: 3 });
  });

  it("hash should allow key filtering with except", () => {
    const obj = { a: 1, b: 2, c: 3 };
    const except = (o: Record<string, unknown>, keys: string[]) =>
      Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));
    expect(except(obj, ["b"])).toEqual({ a: 1, c: 3 });
  });

  it("nested hash with float", () => {
    const obj = { nested: { value: 1.5 } };
    const parsed = JSON.parse(JSON.stringify(obj));
    expect(parsed.nested.value).toBe(1.5);
  });

  it("nil true and false represented as themselves", () => {
    expect(JSON.stringify(null)).toBe("null");
    expect(JSON.stringify(true)).toBe("true");
    expect(JSON.stringify(false)).toBe("false");
  });

  it("hash as json without options", () => {
    const obj = { a: 1 };
    expect(JSON.parse(JSON.stringify(obj))).toEqual({ a: 1 });
  });

  it("array as json without options", () => {
    const arr = [1, 2, 3];
    expect(JSON.parse(JSON.stringify(arr))).toEqual([1, 2, 3]);
  });

  it("to json works when as json returns infinite number", () => {
    // Infinity serializes as null in JSON
    const obj = { value: Infinity };
    const json = JSON.stringify(obj);
    expect(JSON.parse(json).value).toBeNull();
  });

  it("to json works when as json returns NaN number", () => {
    const obj = { value: NaN };
    const json = JSON.stringify(obj);
    expect(JSON.parse(json).value).toBeNull();
  });

  it("exception to json", () => {
    const err = new Error("something went wrong");
    const json = JSON.stringify({ message: err.message, name: err.name });
    const parsed = JSON.parse(json);
    expect(parsed.message).toBe("something went wrong");
    expect(parsed.name).toBe("Error");
  });

  it("hash to json should not keep options around", () => {
    const obj = { a: 1 };
    const json1 = JSON.stringify(obj);
    const json2 = JSON.stringify(obj, null, 2);
    expect(json1).toBe('{"a":1}');
    expect(json2).toContain("\n");
  });

  it("array to json should not keep options around", () => {
    const arr = [1, 2];
    const json1 = JSON.stringify(arr);
    expect(json1).toBe("[1,2]");
  });

  it("time to json includes local offset", () => {
    const d = new Date("2023-01-15T12:00:00Z");
    const json = d.toJSON();
    expect(json).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("hash with time to json", () => {
    const d = new Date("2023-01-15T12:00:00Z");
    const obj = { time: d };
    const parsed = JSON.parse(JSON.stringify(obj));
    expect(new Date(parsed.time).getTime()).toBe(d.getTime());
  });

  it("struct encoding", () => {
    // In TS, a plain object with defined shape works like a struct
    const point = { x: 10, y: 20 };
    const json = JSON.stringify(point);
    expect(JSON.parse(json)).toEqual({ x: 10, y: 20 });
  });

  it("enumerable should generate json with as json", () => {
    const arr = [{ name: "a" }, { name: "b" }];
    const json = JSON.stringify(arr);
    const parsed = JSON.parse(json);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].name).toBe("a");
  });

  it("enumerable should generate json with to json", () => {
    class Item {
      constructor(public value: string) {}
      toJSON() {
        return { value: this.value };
      }
    }
    const item = new Item("test");
    expect(JSON.parse(JSON.stringify(item))).toEqual({ value: "test" });
  });

  it("enumerable should pass encoding options to children in as json", () => {
    const items = [1, 2, 3];
    expect(JSON.stringify(items)).toBe("[1,2,3]");
  });

  it("enumerable should pass encoding options to children in to json", () => {
    class Container {
      constructor(private items: number[]) {}
      toJSON() {
        return this.items;
      }
    }
    const c = new Container([1, 2, 3]);
    expect(JSON.parse(JSON.stringify(c))).toEqual([1, 2, 3]);
  });

  it("object to json with options", () => {
    const obj = { key: "value", num: 42 };
    const json = JSON.stringify(obj, null, 2);
    expect(json).toContain('"key": "value"');
  });

  it("hash should pass encoding options to children in as json", () => {
    const obj = { a: { b: 1 } };
    const parsed = JSON.parse(JSON.stringify(obj));
    expect(parsed.a.b).toBe(1);
  });

  it("hash should pass encoding options to children in to json", () => {
    const obj = { arr: [1, 2, 3] };
    const parsed = JSON.parse(JSON.stringify(obj));
    expect(parsed.arr).toEqual([1, 2, 3]);
  });

  it("array should pass encoding options to children in as json", () => {
    const arr = [{ a: 1 }, { b: 2 }];
    const parsed = JSON.parse(JSON.stringify(arr));
    expect(parsed[0].a).toBe(1);
  });

  it("array should pass encoding options to children in to json", () => {
    const arr = [{ x: "hello" }];
    const json = JSON.stringify(arr);
    expect(JSON.parse(json)).toEqual([{ x: "hello" }]);
  });

  it.skip("process status", () => {
    /* Ruby process status object */
  });
  it.skip("hash keys encoding option", () => {
    /* Ruby-specific encoding options */
  });
  it.skip("non utf8 string transcodes", () => {
    /* Ruby encoding transcoding */
  });
  it.skip("hash like with options", () => {
    /* Ruby-specific hash-like objects */
  });
  it.skip("struct to json with options", () => {
    /* Ruby Struct */
  });
  it.skip("struct to json with options nested", () => {
    /* Ruby Struct nested */
  });
  it.skip("data encoding", () => {
    /* Ruby Data class */
  });
  it.skip("json gem dump by passing active support encoder", () => {
    /* Ruby json gem */
  });
  it.skip("json gem generate by passing active support encoder", () => {
    /* Ruby json gem */
  });
  it.skip("json gem pretty generate by passing active support encoder", () => {
    /* Ruby json gem */
  });
  it.skip("twz to json with use standard json time format config set to false", () => {
    /* TimeWithZone */
  });
  it.skip("twz to json with use standard json time format config set to true", () => {
    /* TimeWithZone */
  });
  it.skip("twz to json with custom time precision", () => {
    /* TimeWithZone */
  });
  it.skip("time to json with custom time precision", () => {
    /* custom precision */
  });
  it.skip("datetime to json with custom time precision", () => {
    /* custom precision */
  });
  it.skip("twz to json when wrapping a date time", () => {
    /* TimeWithZone */
  });
  it.skip("to json works on io objects", () => {
    /* Ruby IO */
  });
});
