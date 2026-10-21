import { describe, expect, it } from "vitest";
import { ObjectSpace } from "./object-space.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Enumerator } from "./enumerator.js";
import { File } from "./file.js";
import { NotImplementedError } from "./not-implemented-error.js";

const gc = (globalThis as { gc?: () => void }).gc;

describe("ObjectSpace::WeakMap", () => {
  it("[]= returns the value; each_key yields each key once, in insertion order, and returns the map", async () => {
    const map = new ObjectSpace.WeakMap<object, object>();
    const a = { name: "a" };
    const b = { name: "b" };
    map.set(a, a);
    map.set(b, b);
    expect(map.set(a, b)).toBe(b);
    const keys: object[] = [];
    expect(await map.eachKey((key) => keys.push(key))).toBe(map);
    expect(keys).toEqual([a, b]);
  });

  it("each_key awaits the block before yielding the next key", async () => {
    const map = new ObjectSpace.WeakMap<object, object>();
    const a = {};
    const b = {};
    map.set(a, a);
    map.set(b, b);
    const order: string[] = [];
    await map.eachKey(async (key) => {
      order.push(key === a ? "enter a" : "enter b");
      await Promise.resolve();
      order.push(key === a ? "leave a" : "leave b");
    });
    expect(order).toEqual(["enter a", "leave a", "enter b", "leave b"]);
  });

  it.skipIf(!gc)("holds its keys weakly and yields only live ones", async () => {
    const map = new ObjectSpace.WeakMap<object, object>();
    const live = {};
    map.set(live, live);
    (() => {
      const dead = {};
      map.set(dead, dead);
    })();
    await new Promise((resolve) => setTimeout(resolve, 0));
    gc!();
    const keys: object[] = [];
    await map.eachKey((key) => keys.push(key));
    expect(keys).toEqual([live]);
  });
});

describe("ObjectSpace.each_object", () => {
  it("each_object(File) yields open and closed files and raises outside IO", () => {
    const path = join(mkdtempSync(join(tmpdir(), "os-each-")), "a.txt");
    const file = File.open(path, "w+");
    const found = () => {
      const files: File[] = [];
      ObjectSpace.eachObject(File, (f) => files.push(f as File));
      return files.filter((f) => f.path() === path);
    };
    expect(found()).toEqual([file]);
    expect(file.isClosed()).toBe(false);
    file.close();
    expect(found()).toEqual([file]);
    expect(file.isClosed()).toBe(true);
    expect(ObjectSpace.eachObject(File, () => null)).toBeGreaterThanOrEqual(1);
    const enumerator = ObjectSpace.eachObject(File);
    expect(enumerator).toBeInstanceOf(Enumerator);
    expect((enumerator as Enumerator<File>).toA()).toContain(file);
    expect(() => ObjectSpace.eachObject(String, () => null)).toThrow(NotImplementedError);
  });
});
