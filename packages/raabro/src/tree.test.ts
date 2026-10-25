import { Sample, chas } from "./test-helpers/spec-helper.js";
import { Input, type Tree } from "./raabro.js";
import { describe, expect, it } from "vitest";
describe("Raabro::Tree", () => {
  describe(".lookup", () => {
    it("returns the first node with the given name", () => {
      const t = Sample.Cal.parse("4 5 6 + 1 2 3 * +", { rewrite: false }) as Tree;

      expect(t.lookup("item")!.toA(":leaves")).toEqual([
        ":item",
        1,
        0,
        1,
        null,
        ":alt",
        [[":num", 1, 0, 1, null, ":rex", "4"]],
      ]);
    });

    it("returns the first named node if the given name is null", () => {
      const t = Sample.Cal.parse("4 5 6 + 1 2 3 * +", { rewrite: false }) as Tree;

      expect(t.lookup()!.toA(":leaves")).toEqual([
        ":item",
        1,
        0,
        1,
        null,
        ":alt",
        [[":num", 1, 0, 1, null, ":rex", "4"]],
      ]);
    });
  });

  describe(".sublookup", () => {
    it("skips the callee node", () => {
      let t = Sample.Cal.parse("4 5 6 + 1 2 3 * +", { rewrite: false }) as Tree;
      t = t.children[0];

      expect(t.sublookup()!.toA(":leaves")).toEqual([":num", 1, 0, 1, null, ":rex", "4"]);
    });
  });

  describe(".gather", () => {
    it("returns all the nodes with a given name", () => {
      const t = Sample.Cal.parse("4 5 6 + 1 2 3 * +", { rewrite: false }) as Tree;

      expect(t.gather("op").map((n) => n.toA(":leaves"))).toEqual([
        [":op", 1, 6, 1, null, ":rex", "+"],
        [":op", 1, 14, 1, null, ":rex", "*"],
        [":op", 1, 16, 1, null, ":rex", "+"],
      ]);
    });

    it("returns all the nodes with a name if the given name is null", () => {
      const t = Sample.Cal.parse("4 5 6 + 1 2 3 * +", { rewrite: false }) as Tree;

      expect(t.gather().map((n) => n.toA(":leaves"))).toEqual([
        [":item", 1, 0, 1, null, ":alt", [[":num", 1, 0, 1, null, ":rex", "4"]]],
        [":item", 1, 2, 1, null, ":alt", [[":num", 1, 2, 1, null, ":rex", "5"]]],
        [":item", 1, 4, 1, null, ":alt", [[":num", 1, 4, 1, null, ":rex", "6"]]],
        [":item", 1, 6, 1, null, ":alt", [[":op", 1, 6, 1, null, ":rex", "+"]]],
        [":item", 1, 8, 1, null, ":alt", [[":num", 1, 8, 1, null, ":rex", "1"]]],
        [":item", 1, 10, 1, null, ":alt", [[":num", 1, 10, 1, null, ":rex", "2"]]],
        [":item", 1, 12, 1, null, ":alt", [[":num", 1, 12, 1, null, ":rex", "3"]]],
        [":item", 1, 14, 1, null, ":alt", [[":op", 1, 14, 1, null, ":rex", "*"]]],
        [":item", 1, 16, 1, null, ":alt", [[":op", 1, 16, 1, null, ":rex", "+"]]],
      ]);
    });
  });

  describe(".subgather", () => {
    it("skips the callee node", () => {
      const t = Sample.Cal.parse("4 5 6 + 1 2 3 * +", { rewrite: false }) as Tree;

      expect(t.children[0].subgather().map((n) => n.toA(":leaves"))).toEqual([
        [":num", 1, 0, 1, null, ":rex", "4"],
      ]);
    });
  });

  describe(".string", () => {
    it("returns the string covered by the tree", () => {
      const t = Sample.Arith.parse("11 + 12", { rewrite: false }) as Tree;

      expect(t.string()).toEqual("11 + 12");
      expect(t.sublookup(":number")!.string()).toEqual("11 ");
      expect(t.sublookup(":plus")!.string()).toEqual("+ ");
    });
  });

  describe(".strinp", () => {
    it("returns the string covered by the tree by stripped", () => {
      const t = Sample.Arith.parse("11 + 13", { rewrite: false }) as Tree;

      expect(t.strinp()).toEqual("11 + 13");
      expect(t.sublookup(":number")!.strinp()).toEqual("11");
      expect(t.sublookup(":plus")!.strinp()).toEqual("+");
    });
  });

  describe(".strim", () => {
    it("returns the string covered by the tree by stripped", () => {
      const t = Sample.Arith.parse("11 + 13", { rewrite: false }) as Tree;

      expect(t.strim()).toEqual("11 + 13");
      expect(t.sublookup(":number")!.strim()).toEqual("11");
      expect(t.sublookup(":plus")!.strim()).toEqual("+");
    });
  });

  describe(".strind", () => {
    it("returns the string covered by the tree downcased", () => {
      const i = new Input("Hello");
      const t = chas(i);

      expect(t.strind()).toEqual("hello");
    });
  });

  describe(".strinpd", () => {
    it("returns the string covered by the tree stripped and downcased", () => {
      const i = new Input("AloaH ");
      const t = chas(i);

      expect(t.strinpd()).toEqual("aloah");
    });
  });

  describe(".symbol", () => {
    it("returns the string covered by the tree as a symbol", () => {
      const i = new Input("Hello ");
      const t = chas(i);

      expect(t.symbol()).toEqual(":Hello");
    });
  });

  describe(".symbod", () => {
    it("returns the string covered by the tree as a downcased symbol", () => {
      const i = new Input("Hello ");
      const t = chas(i);

      expect(t.symbod()).toEqual(":hello");
    });
  });
});
