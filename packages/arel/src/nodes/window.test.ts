import { describe, it, expect } from "vitest";
import { Nodes } from "../index.js";
import type { Node } from "./node.js";
import { uniq } from "../test-helpers/uniq.js";

describe("Window", () => {
  describe("equality", () => {
    it("is equal with equal ivars", () => {
      const window1 = new Nodes.Window();
      window1.orders = [1, 2] as unknown as Node[];
      window1.partitions = [1] as unknown as Node[];
      window1.frame(3 as unknown as Node);
      const window2 = new Nodes.Window();
      window2.orders = [1, 2] as unknown as Node[];
      window2.partitions = [1] as unknown as Node[];
      window2.frame(3 as unknown as Node);
      const array = [window1, window2];
      expect(uniq(array).length).toBe(1);
    });

    it("is not equal with different ivars", () => {
      const window1 = new Nodes.Window();
      window1.orders = [1, 2] as unknown as Node[];
      window1.partitions = [1] as unknown as Node[];
      window1.frame(3 as unknown as Node);
      const window2 = new Nodes.Window();
      window2.orders = [1, 2] as unknown as Node[];
      window1.partitions = [1] as unknown as Node[];
      window2.frame(4 as unknown as Node);
      const array = [window1, window2];
      expect(uniq(array).length).toBe(2);
    });
  });
});

describe("NamedWindow", () => {
  describe("equality", () => {
    it("is equal with equal ivars", () => {
      const window1 = new Nodes.NamedWindow("foo");
      window1.orders = [1, 2] as unknown as Node[];
      window1.partitions = [1] as unknown as Node[];
      window1.frame(3 as unknown as Node);
      const window2 = new Nodes.NamedWindow("foo");
      window2.orders = [1, 2] as unknown as Node[];
      window2.partitions = [1] as unknown as Node[];
      window2.frame(3 as unknown as Node);
      const array = [window1, window2];
      expect(uniq(array).length).toBe(1);
    });

    it("is not equal with different ivars", () => {
      const window1 = new Nodes.NamedWindow("foo");
      window1.orders = [1, 2] as unknown as Node[];
      window1.partitions = [1] as unknown as Node[];
      window1.frame(3 as unknown as Node);
      const window2 = new Nodes.NamedWindow("bar");
      window2.orders = [1, 2] as unknown as Node[];
      window2.partitions = [1] as unknown as Node[];
      window2.frame(3 as unknown as Node);
      const array = [window1, window2];
      expect(uniq(array).length).toBe(2);
    });
  });
});

describe("CurrentRow", () => {
  describe("equality", () => {
    it("is equal to other current row nodes", () => {
      const array = [new Nodes.CurrentRow(), new Nodes.CurrentRow()];
      expect(uniq(array).length).toBe(1);
    });

    it("is not equal with other nodes", () => {
      const array = [new Nodes.CurrentRow(), new (Nodes.Node as unknown as new () => Node)()];
      expect(uniq(array).length).toBe(2);
    });
  });
});
