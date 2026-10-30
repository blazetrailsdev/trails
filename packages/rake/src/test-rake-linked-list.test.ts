import { describe, expect, it } from "vitest";
import { map } from "@blazetrails/ruby-compat";
import { LinkedList } from "./linked-list.js";

describe("TestLinkedList", () => {
  it("empty list", () => {
    const empty = LinkedList.EMPTY;
    expect(empty.isEmpty()).toBeTruthy();
  });

  it("list with one item", () => {
    const list = LinkedList.make("one");
    expect(!list.isEmpty()).toBeTruthy();
    expect(list.head).toBe("one");
    expect(list.tail).toEqual(LinkedList.EMPTY);
  });

  it("make with no arguments", () => {
    const empty = LinkedList.make();
    expect(empty).toEqual(LinkedList.EMPTY);
  });

  it("make with one argument", () => {
    const list = LinkedList.make("one");
    expect(!list.isEmpty()).toBeTruthy();
    expect(list.head).toBe("one");
    expect(list.tail).toEqual(LinkedList.EMPTY);
  });

  it("make with two arguments", () => {
    const list = LinkedList.make("one", "two");
    expect(!list.isEmpty()).toBeTruthy();
    expect(list.head).toBe("one");
    expect(list.tail.head).toBe("two");
    expect(list.tail.tail).toEqual(LinkedList.EMPTY);
  });

  it("list with several items", () => {
    const list = LinkedList.make("one", "two", "three");

    expect(!list.isEmpty()).toBeTruthy();
    expect(list.head).toBe("one");
    expect(list.tail.head).toBe("two");
    expect(list.tail.tail.head).toBe("three");
    expect(list.tail.tail.tail).toEqual(LinkedList.EMPTY);
  });

  it("lists are structurally equivalent", () => {
    const list = LinkedList.make(1, 2, 3);
    const same = LinkedList.make(1, 2, 3);
    const diff = LinkedList.make(1, 2, 4);
    const short = LinkedList.make(1, 2);

    expect(list).toEqual(same);
    expect(list).not.toEqual(diff);
    expect(list).not.toEqual(short);
    expect(short).not.toEqual(list);
  });

  it("conversion to string", () => {
    const list = LinkedList.make("one", "two", "three");
    expect(list.toString()).toBe("LL(one, two, three)");
    expect(LinkedList.make().toString()).toBe("LL()");
  });

  it("conversion with inspect", () => {
    expect(LinkedList.make().inspect()).toBe("LL()");
  });

  it("lists are enumerable", () => {
    const list = LinkedList.make(1, 2, 3);
    const newList = map(list, (item: number) => item + 10);
    const expected = [11, 12, 13];
    expect(newList).toEqual(expected);
  });

  it("conjunction", () => {
    const list = LinkedList.make<string>().conj("C").conj("B").conj("A");
    expect(list).toEqual(LinkedList.make("A", "B", "C"));
  });
});
