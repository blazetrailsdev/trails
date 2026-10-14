import { describe, expect, it } from "vitest";
import { isEmpty } from "./ruby-empty.js";

describe("isEmpty", () => {
  it("sends empty? to a receiver that defines it", () => {
    class Bag {
      isEmpty(): boolean {
        return true;
      }
      readonly contents = ["x"];
    }
    expect(isEmpty(new Bag())).toBe(true);
  });

  it("reads a plain hash's isEmpty key as data, not as its empty?", () => {
    expect(isEmpty({ isEmpty: () => true })).toBe(false);
    expect(isEmpty(Object.assign(Object.create(null), { isEmpty: () => true }))).toBe(false);
  });
});
