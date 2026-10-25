import { beforeEach, describe, expect, it } from "vitest";
import { XmlEvents } from "./xmlevents.js";

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

  const expectEvent = (value: unknown[]) => expect(target.events.shift()).toEqual(value);
  const expectDone = () => expect(target.events.shift()).toBeUndefined();

  it("simple", () => {
    xml.one();
    expectEvent([":start_tag", ":one", null]);
    expectEvent([":end_tag", ":one"]);
    expectDone();
  });

  it("nested", () => {
    xml.one(() => xml.two());
    expectEvent([":start_tag", ":one", null]);
    expectEvent([":start_tag", ":two", null]);
    expectEvent([":end_tag", ":two"]);
    expectEvent([":end_tag", ":one"]);
    expectDone();
  });

  it("text", () => {
    xml.one("a");
    expectEvent([":start_tag", ":one", null]);
    expectEvent([":text", "a"]);
    expectEvent([":end_tag", ":one"]);
    expectDone();
  });

  it("special text", () => {
    xml.one("H&R");
    expectEvent([":start_tag", ":one", null]);
    expectEvent([":text", "H&R"]);
    expectEvent([":end_tag", ":one"]);
    expectDone();
  });

  it("text with entity", () => {
    xml.one("H&amp;R");
    expectEvent([":start_tag", ":one", null]);
    expectEvent([":text", "H&amp;R"]);
    expectEvent([":end_tag", ":one"]);
    expectDone();
  });

  it("attributes", () => {
    xml.a({ b: "c", x: "y" });
    expectEvent([":start_tag", ":a", { x: "y", b: "c" }]);
    expectEvent([":end_tag", ":a"]);
    expectDone();
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
    expectEvent([":start_tag", ":address-book", null]);
    expectEvent([":start_tag", ":entry", { id: "1" }]);
    expectEvent([":start_tag", ":name", null]);
    expectEvent([":start_tag", ":first", null]);
    expectEvent([":text", "Bill"]);
    expectEvent([":end_tag", ":first"]);
    expectEvent([":start_tag", ":last", null]);
    expectEvent([":text", "Smith"]);
    expectEvent([":end_tag", ":last"]);
    expectEvent([":end_tag", ":name"]);
    expectEvent([":start_tag", ":address", null]);
    expectEvent([":text", "Cincinnati"]);
    expectEvent([":end_tag", ":address"]);
    expectEvent([":end_tag", ":entry"]);
    expectEvent([":start_tag", ":entry", { id: "2" }]);
    expectEvent([":start_tag", ":name", null]);
    expectEvent([":start_tag", ":first", null]);
    expectEvent([":text", "John"]);
    expectEvent([":end_tag", ":first"]);
    expectEvent([":start_tag", ":last", null]);
    expectEvent([":text", "Doe"]);
    expectEvent([":end_tag", ":last"]);
    expectEvent([":end_tag", ":name"]);
    expectEvent([":start_tag", ":address", null]);
    expectEvent([":text", "Columbus"]);
    expectEvent([":end_tag", ":address"]);
    expectEvent([":end_tag", ":entry"]);
    expectEvent([":end_tag", ":address-book"]);
    expectDone();
  });
});
