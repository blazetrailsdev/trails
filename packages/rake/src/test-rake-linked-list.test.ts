import { describe, expect, it } from "vitest";
import { map } from "@blazetrails/ruby-compat";
import { LinkedList } from "./linked-list.js";

describe("TestLinkedList", () => {
  it("empty list", () => {
    const empty = LinkedList.EMPTY;
    expect(empty.isEmpty()).toBe(true);
  });

  it("list with one item", () => {
    const list = LinkedList.make("one");
    expect(list.isEmpty()).toBe(false);
    expect(list.head).toBe("one");
    expect(list.tail.equals(LinkedList.EMPTY)).toBe(true);
  });

  it("make with no arguments", () => {
    const empty = LinkedList.make();
    expect(empty.equals(LinkedList.EMPTY)).toBe(true);
  });

  it("make with one argument", () => {
    const list = LinkedList.make("one");
    expect(list.isEmpty()).toBe(false);
    expect(list.head).toBe("one");
    expect(list.tail.equals(LinkedList.EMPTY)).toBe(true);
  });

  it("make with two arguments", () => {
    const list = LinkedList.make("one", "two");
    expect(list.isEmpty()).toBe(false);
    expect(list.head).toBe("one");
    expect(list.tail.head).toBe("two");
    expect(list.tail.tail.equals(LinkedList.EMPTY)).toBe(true);
  });

  it("list with several items", () => {
    const list = LinkedList.make("one", "two", "three");

    expect(list.isEmpty()).toBe(false);
    expect(list.head).toBe("one");
    expect(list.tail.head).toBe("two");
    expect(list.tail.tail.head).toBe("three");
    expect(list.tail.tail.tail.equals(LinkedList.EMPTY)).toBe(true);
  });

  it("lists are structurally equivalent", () => {
    const list = LinkedList.make(1, 2, 3);
    const same = LinkedList.make(1, 2, 3);
    const diff = LinkedList.make(1, 2, 4);
    const short = LinkedList.make(1, 2);

    expect(list.equals(same)).toBe(true);
    expect(list.equals(diff)).toBe(false);
    expect(list.equals(short)).toBe(false);
    expect(short.equals(list)).toBe(false);
  });

  it("conversion to string", () => {
    const list = LinkedList.make("one", "two", "three");
    expect(list.toString()).toBe("LL(one, two, three)");
    expect(LinkedList.make().toString()).toBe("LL()");
  });

  it("conversion with inspect", () => {
    const list = LinkedList.make("one", "two", "three");
    expect(list.inspect()).toBe('LL("one", "two", "three")');
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
    expect(list.equals(LinkedList.make("A", "B", "C"))).toBe(true);
  });
});
