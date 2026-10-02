import { describe, it, expect } from "vitest";
import { Time } from "@blazetrails/date";
import { rbObjDup } from "@blazetrails/ruby-compat";
import { deepDup } from "../../hash-utils.js";
import { TimeWithZone } from "../../time-with-zone.js";
import { TimeZone } from "../../values/time-zone.js";

describe("Object#deep_dup", () => {
  it("dups a duplicable object and runs its initialize_dup", () => {
    class Tagged {
      tags = ["a"];
      initializeDup(orig: Tagged): void {
        this.tags = [...orig.tags];
      }
    }
    const tagged = new Tagged();
    const dup = deepDup(tagged);

    expect(dup).toBeInstanceOf(Tagged);
    expect(dup).not.toBe(tagged);
    expect(dup.tags).toEqual(["a"]);
    expect(dup.tags).not.toBe(tagged.tags);
  });

  it("sends dup to an object that defines it", () => {
    class Sealed {
      #secret = 1;
      dup(): Sealed {
        return new Sealed();
      }
      secret(): number {
        return this.#secret;
      }
    }
    expect(deepDup(new Sealed()).secret()).toBe(1);
  });

  it("returns a non-duplicable object itself", () => {
    const fn = (): void => {};
    const weak = new WeakMap();
    expect(deepDup(fn)).toBe(fn);
    expect(deepDup(weak)).toBe(weak);
  });

  it("copies the JS built-ins that hold their state in internal slots", () => {
    const date = new Date(0);
    const map = new Map([["a", 1]]);
    const set = new Set([1]);
    const regexp = /a/g;
    regexp.lastIndex = 2;

    const [dateDup, mapDup, setDup, regexpDup] = [date, map, set, regexp].map(rbObjDup) as [
      Date,
      Map<string, number>,
      Set<number>,
      RegExp,
    ];
    mapDup.set("b", 2);
    setDup.add(2);

    expect(dateDup).not.toBe(date);
    expect(dateDup.getTime()).toBe(0);
    expect([...map.keys()]).toEqual(["a"]);
    expect([...mapDup.keys()]).toEqual(["a", "b"]);
    expect(set.size).toBe(1);
    expect(setDup.size).toBe(2);
    expect([regexpDup.source, regexpDup.flags, regexpDup.lastIndex]).toEqual(["a", "g", 2]);
    expect(deepDup(date).getTime()).toBe(0);
  });

  it("dups a Time and a TimeWithZone into working copies", () => {
    const time = Time.utc(2000, 1, 1);
    const timeDup = deepDup(time);
    expect(timeDup).not.toBe(time);
    expect(timeDup.eql(time)).toBe(true);
    expect(timeDup.year).toBe(2000);

    const twz = new TimeWithZone(time, TimeZone.find("Eastern Time (US & Canada)")!);
    const twzDup = deepDup(twz);
    expect(twzDup).not.toBe(twz);
    expect(twzDup.eql(twz)).toBe(true);
    expect((twzDup as unknown as { year: number }).year).toBe(1999);
  });
});
