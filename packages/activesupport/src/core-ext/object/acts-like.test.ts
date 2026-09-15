import { describe, expect, it } from "vitest";
import { Temporal } from "@blazetrails/date";
import { Object as ObjectExt } from "./acts-like.js";

class DuckTime {
  actsLikeTime() {
    return true;
  }
}

class Stringish extends String {}

class DuckString {
  actsLikeString() {
    return true;
  }
}

describe("ObjectTests", () => {
  it("duck typing", () => {
    const object = new (class {})();
    const time = Temporal.Now.instant();
    const date = Temporal.Now.plainDateISO();
    const dt = new Temporal.PlainDateTime(-4712, 1, 1);
    const duck = new DuckTime();

    expect(ObjectExt.actsLike(object, "time")).toBeFalsy();
    expect(ObjectExt.actsLike(object, "date")).toBeFalsy();
    expect(ObjectExt.actsLike(time, "time")).toBeTruthy();
    expect(ObjectExt.actsLike(time, "date")).toBeFalsy();
    expect(ObjectExt.actsLike(date, "time")).toBeFalsy();
    expect(ObjectExt.actsLike(date, "date")).toBeTruthy();
    expect(ObjectExt.actsLike(dt, "time")).toBeTruthy();
    expect(ObjectExt.actsLike(dt, "date")).toBeTruthy();
    expect(ObjectExt.actsLike(duck, "time")).toBeTruthy();
    expect(ObjectExt.actsLike(duck, "date")).toBeFalsy();
  });

  it("acts like string", () => {
    const string = new Stringish();
    const duckString = new DuckString();

    expect(ObjectExt.actsLike(string, "string")).toBeTruthy();
    expect(ObjectExt.actsLike(string, "invalid")).toBeFalsy();
    expect(ObjectExt.actsLike(duckString, "string")).toBeTruthy();
    expect(ObjectExt.actsLike(duckString, "invalid")).toBeFalsy();
  });
});
