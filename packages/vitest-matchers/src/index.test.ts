import { describe, expect, it } from "vitest";

class Money {
  constructor(readonly cents: number) {}
  equals(other: unknown): boolean {
    return other instanceof Money && other.cents === this.cents;
  }
}

class Euro extends Money {}

describe("RubyMatchers", () => {
  it("treats only nil and false as falsy", () => {
    for (const x of [0, "", Number.NaN, true, []]) expect(x).toBeRubyTruthy();
    for (const x of [null, undefined, false]) expect(x).toBeRubyFalsy();
    expect(0).not.toBeRubyFalsy();
  });

  it("compares within a delta, defaulting to 0.001", () => {
    expect(1.0005).toBeWithinDelta(1);
    expect(1.01).not.toBeWithinDelta(1);
    expect(1.4).toBeWithinDelta(1, 0.5);
  });

  it("asks the receiver's empty?", () => {
    expect([]).toBeEmpty();
    expect("").toBeEmpty();
    expect(new Map()).toBeEmpty();
    expect({}).toBeEmpty();
    expect({ a: 1 }).not.toBeEmpty();
  });

  it("checks the exact class", () => {
    expect(new Euro(1)).toBeExactInstanceOf(Euro);
    expect(new Euro(1)).not.toBeExactInstanceOf(Money);
    expect(new Euro(1)).toBeInstanceOf(Money);
  });

  it("asks respond_to?", () => {
    expect(new Money(1)).toRespondTo("equals");
    expect(new Money(1)).not.toRespondTo("missing");
  });

  it("defers toEqual to an operand's Ruby ==", () => {
    expect(new Money(5)).toEqual(new Euro(5));
    expect(new Money(5)).not.toEqual(new Money(6));
    expect([new Money(1)]).toEqual([new Money(1)]);
    expect({ a: 1 }).toEqual({ a: 1 });
  });
});
