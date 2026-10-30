import { beforeEach, describe, expect, it } from "vitest";
import { RuntimeError } from "@blazetrails/ruby-compat";
import { InvocationChain } from "./invocation-chain.js";

describe("TestRakeInvocationChain", () => {
  let empty: InvocationChain<string>;
  let firstMember: string;
  let secondMember: string;
  let one: InvocationChain<string>;
  let two: InvocationChain<string>;

  beforeEach(() => {
    empty = InvocationChain.empty() as InvocationChain<string>;

    firstMember = "A";
    secondMember = "B";
    one = empty.append(firstMember);
    two = one.append(secondMember);
  });

  it("conj on invocation chains", () => {
    const list = InvocationChain.empty<string>().conj("B").conj("A");
    expect(list.equals(InvocationChain.make("A", "B"))).toBe(true);
    expect(list.constructor).toBe(InvocationChain);
  });

  it("make on invocation chains", () => {
    expect(empty.equals(InvocationChain.make())).toBe(true);
    expect(one.equals(InvocationChain.make(firstMember))).toBe(true);
    expect(two.equals(InvocationChain.make(secondMember, firstMember))).toBe(true);
  });

  it("append with one argument", () => {
    const chain = empty.append("A");

    expect(chain.toString()).toBe("TOP => A");
  });

  it("append one circular", () => {
    let ex: Error | undefined;
    expect(() => {
      try {
        one.append(firstMember);
      } catch (e) {
        ex = e as Error;
        throw e;
      }
    }).toThrow(RuntimeError);
    expect(ex!.message).toMatch(/circular +dependency/i);
    expect(ex!.message).toMatch(/A.*=>.*A/);
  });

  it("append two circular", () => {
    let ex: Error | undefined;
    expect(() => {
      try {
        two.append(firstMember);
      } catch (e) {
        ex = e as Error;
        throw e;
      }
    }).toThrow(RuntimeError);
    expect(ex!.message).toMatch(/A.*=>.*B.*=>.*A/);
  });

  it("member eh one", () => {
    expect(one.isMember(firstMember)).toBeTruthy();
  });

  it("member eh two", () => {
    expect(two.isMember(firstMember)).toBeTruthy();
    expect(two.isMember(secondMember)).toBeTruthy();
  });

  it("to s empty", () => {
    expect(empty.toString()).toBe("TOP");
    expect(one.toString()).toBe("TOP => A");
  });
});
