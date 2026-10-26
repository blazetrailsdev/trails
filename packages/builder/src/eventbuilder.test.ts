import { beforeEach, describe, expect, it } from "vitest";
import { XmlEvents } from "./xmlevents.js";

function expectEvent(target: { events: unknown[][] }, value: unknown[]): void {
  expect(target.events.shift()).toEqual(value);
}

describe("TestEvents", () => {
  class Target {
    events: unknown[][] = [];

    startTag(tag: string, attrs: Record<string, unknown> | null): void {
      this.events.push([":start_tag", tag, attrs]);
    }

    endTag(tag: string): void {
      this.events.push([":end_tag", tag]);
    }

    text(string: string): void {
      this.events.push([":text", string]);
    }
  }

  let target: Target;
  let xml: XmlEvents;
  beforeEach(() => {
    target = new Target();
    xml = new XmlEvents({ target: target as never });
  });

  it("simple", () => {
    xml.one();
    expectEvent(target, [":start_tag", ":one", null]);
    expectEvent(target, [":end_tag", ":one"]);
    expect(target.events.shift()).toBeUndefined();
  });

  it("nested", () => {
    xml.one(() => xml.two());
    expectEvent(target, [":start_tag", ":one", null]);
    expectEvent(target, [":start_tag", ":two", null]);
    expectEvent(target, [":end_tag", ":two"]);
    expectEvent(target, [":end_tag", ":one"]);
    expect(target.events.shift()).toBeUndefined();
  });

  it("text", () => {
    xml.one("a");
    expectEvent(target, [":start_tag", ":one", null]);
    expectEvent(target, [":text", "a"]);
    expectEvent(target, [":end_tag", ":one"]);
    expect(target.events.shift()).toBeUndefined();
  });

  it("special text", () => {
    xml.one("H&R");
    expectEvent(target, [":start_tag", ":one", null]);
    expectEvent(target, [":text", "H&R"]);
    expectEvent(target, [":end_tag", ":one"]);
    expect(target.events.shift()).toBeUndefined();
  });

  it("text with entity", () => {
    xml.one("H&amp;R");
    expectEvent(target, [":start_tag", ":one", null]);
    expectEvent(target, [":text", "H&amp;R"]);
    expectEvent(target, [":end_tag", ":one"]);
    expect(target.events.shift()).toBeUndefined();
  });

  it("attributes", () => {
    xml.a({ b: "c", x: "y" });
    expectEvent(target, [":start_tag", ":a", { x: "y", b: "c" }]);
    expectEvent(target, [":end_tag", ":a"]);
    expect(target.events.shift()).toBeUndefined();
  });

  it("moderately complex", () => {
    xml.tagBang("address-book", (x: XmlEvents) => {
      x.entry({ id: "1" }, () => {
        x.name(() => {
          x.first("Bill");
          x.last("Smith");
        });
        x.address("Cincinnati");
      });
      x.entry({ id: "2" }, () => {
        x.name(() => {
          x.first("John");
          x.last("Doe");
        });
        x.address("Columbus");
      });
    });
    expectEvent(target, [":start_tag", ":address-book", null]);
    expectEvent(target, [":start_tag", ":entry", { id: "1" }]);
    expectEvent(target, [":start_tag", ":name", null]);
    expectEvent(target, [":start_tag", ":first", null]);
    expectEvent(target, [":text", "Bill"]);
    expectEvent(target, [":end_tag", ":first"]);
    expectEvent(target, [":start_tag", ":last", null]);
    expectEvent(target, [":text", "Smith"]);
    expectEvent(target, [":end_tag", ":last"]);
    expectEvent(target, [":end_tag", ":name"]);
    expectEvent(target, [":start_tag", ":address", null]);
    expectEvent(target, [":text", "Cincinnati"]);
    expectEvent(target, [":end_tag", ":address"]);
    expectEvent(target, [":end_tag", ":entry"]);
    expectEvent(target, [":start_tag", ":entry", { id: "2" }]);
    expectEvent(target, [":start_tag", ":name", null]);
    expectEvent(target, [":start_tag", ":first", null]);
    expectEvent(target, [":text", "John"]);
    expectEvent(target, [":end_tag", ":first"]);
    expectEvent(target, [":start_tag", ":last", null]);
    expectEvent(target, [":text", "Doe"]);
    expectEvent(target, [":end_tag", ":last"]);
    expectEvent(target, [":end_tag", ":name"]);
    expectEvent(target, [":start_tag", ":address", null]);
    expectEvent(target, [":text", "Columbus"]);
    expectEvent(target, [":end_tag", ":address"]);
    expectEvent(target, [":end_tag", ":entry"]);
    expectEvent(target, [":end_tag", ":address-book"]);
    expect(target.events.shift()).toBeUndefined();
  });
});
