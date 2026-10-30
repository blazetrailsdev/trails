import { Enumerable, include, map, rbInspect } from "@blazetrails/ruby-compat";

export class LinkedList<T = unknown> {
  readonly head!: T;
  readonly tail!: LinkedList<T>;

  declare static EMPTY: LinkedList<never>;

  constructor(head?: T, tail: LinkedList<T> = new.target.EMPTY) {
    this.head = head as T;
    this.tail = tail;
  }

  conj(item: T): LinkedList<T> {
    return (this.constructor as typeof LinkedList).cons(item, this);
  }

  isEmpty(): boolean {
    return false;
  }

  equals(other: LinkedList<T>): boolean {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let current: LinkedList<T> = this;
    while (!current.isEmpty() && !other.isEmpty()) {
      if (current.head !== other.head) return false;
      current = current.tail;
      other = other.tail;
    }
    return current.isEmpty() && other.isEmpty();
  }

  toString(): string {
    const items = map(this, (item) => String(item)).join(", ");
    return `LL(${items})`;
  }

  inspect(): string {
    const items = map(this, (item) => rbInspect(item)).join(", ");
    return `LL(${items})`;
  }

  each(block: (item: T) => void): this {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let current: LinkedList<T> = this;
    while (!current.isEmpty()) {
      block(current.head);
      current = current.tail;
    }
    return this;
  }

  static make<T>(this: typeof LinkedList, ...args: T[]): LinkedList<T> {
    if (args.length === 0) return this.empty();
    return [...args].reverse().reduce<LinkedList<T>>((list, item) => {
      list = this.cons(item, list);
      return list;
    }, this.empty<T>());
  }

  static cons<T>(head: T, tail: LinkedList<T>): LinkedList<T> {
    return new this(head, tail);
  }

  static empty<T>(): LinkedList<T> {
    return this.EMPTY;
  }

  static EmptyLinkedList: typeof EmptyLinkedList;
}

include(LinkedList, Enumerable);

class EmptyLinkedList extends LinkedList<never> {
  static parent: typeof LinkedList = LinkedList;

  constructor() {
    super(undefined as never, undefined as never);
  }

  override isEmpty(): boolean {
    return true;
  }

  static override cons<T>(head: T, tail: LinkedList<T>): LinkedList<T> {
    return this.parent.cons(head, tail);
  }
}

LinkedList.EmptyLinkedList = EmptyLinkedList;
LinkedList.EMPTY = new EmptyLinkedList();
