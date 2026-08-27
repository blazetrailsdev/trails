import { describe, it, expect } from "vitest";
import { Nodes } from "../index.js";
import { buildQuoted } from "./casted.js";
import { assertNotSame } from "../test-helpers/assertions.js";
import { uniq } from "../test-helpers/uniq.js";

describe("NodesTest", () => {
  describe("Case", () => {
    describe("#initialize", () => {
      it("sets case expression from first argument", () => {
        const node = new Nodes.Case("foo" as unknown as Nodes.Node);

        expect(node.case).toBe("foo");
      });

      it("sets default case from second argument", () => {
        const node = new Nodes.Case(undefined, "bar" as unknown as Nodes.Node);

        expect(node.default).toBe("bar");
      });
    });

    describe("#clone", () => {
      it("clones case, conditions and default", () => {
        const foo = buildQuoted("foo");

        const node = new Nodes.Case();
        node.case = foo;
        node.conditions = [new Nodes.When(foo, foo)];
        node.default = foo;

        const dolly = node.clone();

        expect(dolly.case).toEqual(node.case);
        assertNotSame(node.case, dolly.case);

        expect(dolly.conditions).toEqual(node.conditions);
        assertNotSame(node.conditions, dolly.conditions);

        expect(dolly.default).toEqual(node.default);
        assertNotSame(node.default, dolly.default);
      });
    });

    describe("equality", () => {
      it("is equal with equal ivars", () => {
        const foo = buildQuoted("foo");
        const one = buildQuoted(1);
        const zero = buildQuoted(0);

        const case1 = new Nodes.Case(foo);
        case1.conditions = [new Nodes.When(foo, one)];
        case1.default = new Nodes.Else(zero);

        const case2 = new Nodes.Case(foo);
        case2.conditions = [new Nodes.When(foo, one)];
        case2.default = new Nodes.Else(zero);

        const array = [case1, case2];

        expect(uniq(array).length).toBe(1);
      });

      it("is not equal with different ivars", () => {
        const foo = buildQuoted("foo");
        const bar = buildQuoted("bar");
        const one = buildQuoted(1);
        const zero = buildQuoted(0);

        const case1 = new Nodes.Case(foo);
        case1.conditions = [new Nodes.When(foo, one)];
        case1.default = new Nodes.Else(zero);

        const case2 = new Nodes.Case(foo);
        case2.conditions = [new Nodes.When(bar, one)];
        case2.default = new Nodes.Else(zero);

        const array = [case1, case2];

        expect(uniq(array).length).toBe(2);
      });
    });

    describe("#as", () => {
      it("allows aliasing", () => {
        const node = new Nodes.Case("foo" as unknown as Nodes.Node);
        const as = node.as("bar") as Nodes.As;

        expect(as.left).toEqual(node);
        expect(as.right).toBeInstanceOf(Nodes.SqlLiteral);
      });
    });
  });
});
