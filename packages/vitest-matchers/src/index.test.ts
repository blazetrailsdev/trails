import { stderr } from "@blazetrails/ruby-compat";
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

  it("matches start_with / end_with on strings and arrays", () => {
    expect("magick").toStartWith("ma");
    expect("magick").toEndWith("ick");
    expect([1, 2, 3]).toStartWith(1, 2);
    expect([1, 2, 3]).not.toEndWith(2);
  });

  it("includes substrings, elements, keys and pairs", () => {
    expect("identify").toInclude("dent");
    expect([new Money(1)]).toInclude(new Money(1));
    expect({ a: 1, b: 2 }).toInclude("a", { b: 2 });
    expect({ a: 1 }).not.toInclude({ a: 2 });
    expect(new Map([[1, "x"]])).toHaveKey(1);
  });

  it("contains exactly, in any order", () => {
    expect([3, 1, 2]).toContainExactly(1, 2, 3);
    expect([1, 1]).not.toContainExactly(1);
  });

  it("is between", () => {
    expect(5).toBeBetween(1, 5);
    expect(5).not.toBeBetween(1, 5, "exclusive");
  });

  it("changes a value", async () => {
    const box = { n: 1 };
    await expect(() => box.n++).toChange(() => box.n);
    await expect(() => (box.n += 2)).toChange(() => box.n, { by: 2 });
    await expect(() => (box.n = 9)).toChange(() => box.n, { from: 4, to: 9 });
    await expect(() => undefined).not.toChange(() => box.n);
  });

  it("probes yields", async () => {
    await expect((b: (...a: unknown[]) => unknown) => [1, 2].forEach((x) => b(x))).toYieldControl(
      2,
    );
    await expect((b: (...a: unknown[]) => unknown) => b()).toYieldWithNoArgs();
    await expect((b: (...a: unknown[]) => unknown) => b("a.jpg", 3)).toYieldWithArgs(/jpg/, Number);
    await expect((b: (...a: unknown[]) => unknown) =>
      [1, 2].forEach((x) => b(x)),
    ).toYieldSuccessiveArgs(1, 2);
    await expect(() => undefined).not.toYieldControl();
  });

  it("captures output to stderr", async () => {
    await expect(() => stderr.write("warning: x\n")).toOutput(/warning/, "stderr");
    await expect(() => undefined).not.toOutput(undefined, "stderr");
  });
});
