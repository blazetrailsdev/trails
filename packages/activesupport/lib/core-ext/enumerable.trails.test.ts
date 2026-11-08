import { describe, expect, it } from "vitest";
import { rbFSend, rbObjRespondTo } from "@blazetrails/ruby-compat";
import { tryCall } from "../try.js";
import "./enumerable.js";

describe("Enumerable#maximum through send and try", () => {
  class Payment {
    constructor(readonly price: number) {}
  }
  const payments = [new Payment(5), new Payment(15), new Payment(10)];

  it("answers respond_to? and send for an Array and a Set", () => {
    expect(rbObjRespondTo(payments, "maximum")).toBe(true);
    expect(rbFSend(payments, "maximum", "price")).toBe(15);
    expect(rbFSend(new Set(payments), "maximum", "price")).toBe(15);
    expect(rbFSend([], "maximum", "price")).toBeNull();
  });

  it("is not defined on a receiver that does not include Enumerable", () => {
    expect(rbObjRespondTo(payments[0], "maximum")).toBe(false);
    expect(tryCall(payments[0], "maximum", "price")).toBeUndefined();
  });

  it("a nil key is no block, so the elements themselves are compared", () => {
    expect(rbFSend([3, 9, 4], "maximum", null)).toBe(9);
  });

  it("try reaches it on an Array of records", () => {
    expect(tryCall(payments, "maximum", "price")).toBe(15);
  });
});
