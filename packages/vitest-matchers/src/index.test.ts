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
    expect(null).not.toBeEmpty();
    expect(0).not.toBeEmpty();
    expect(new (class {})()).not.toBeEmpty();
    expect(new Date()).not.toBeEmpty();
    expect(Object.create(null)).toBeEmpty();
  });

  it("checks the exact class", () => {
    expect(new Euro(1)).toBeExactInstanceOf(Euro);
    expect(new Euro(1)).not.toBeExactInstanceOf(Money);
    expect(new Euro(1)).toBeInstanceOf(Money);
    expect("a").toBeExactInstanceOf(String);
  });

  it("asks respond_to?", () => {
    expect(new Money(1)).toRespondTo("equals");
    expect(new Money(1)).not.toRespondTo("missing");
  });

  it("compares with Ruby ==", () => {
    expect(new Euro(5)).toEqualRuby(new Money(5));
    expect(new Money(5)).not.toEqualRuby(new Money(6));
    expect([new Money(1)]).toEqualRuby([new Money(1)]);
  });
});
