import { describe, expect, it } from "vitest";
import { Temporal } from "@blazetrails/date";
import { actsLike } from "./acts-like.js";

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

    expect(actsLike.call(object, "time")).toBeFalsy();
    expect(actsLike.call(object, "date")).toBeFalsy();
    expect(actsLike.call(time, "time")).toBeTruthy();
    expect(actsLike.call(time, "date")).toBeFalsy();
    expect(actsLike.call(date, "time")).toBeFalsy();
    expect(actsLike.call(date, "date")).toBeTruthy();
    expect(actsLike.call(dt, "time")).toBeTruthy();
    expect(actsLike.call(dt, "date")).toBeTruthy();
    expect(actsLike.call(duck, "time")).toBeTruthy();
    expect(actsLike.call(duck, "date")).toBeFalsy();
  });

  it("acts like string", () => {
    const string = new Stringish();
    const duckString = new DuckString();

    expect(actsLike.call(string, "string")).toBeTruthy();
    expect(actsLike.call(string, "invalid")).toBeFalsy();
    expect(actsLike.call(duckString, "string")).toBeTruthy();
    expect(actsLike.call(duckString, "invalid")).toBeFalsy();
  });
});
