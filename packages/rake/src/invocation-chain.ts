import { RuntimeError } from "@blazetrails/ruby-compat";
import { LinkedList } from "./linked-list.js";

export class InvocationChain<T = unknown> extends LinkedList<T> {
  declare static EMPTY: InvocationChain<never>;

  isMember(invocation: T): boolean {
    return this.head === invocation || (this.tail as InvocationChain<T>).isMember(invocation);
  }

  append(invocation: T): InvocationChain<T> {
    if (this.isMember(invocation)) {
      throw new RuntimeError(`Circular dependency detected: ${this.toString()} => ${invocation}`);
    }
    return this.conj(invocation) as InvocationChain<T>;
  }

  override toString(): string {
    return `${this.prefix()}${this.head}`;
  }

  static append<T>(invocation: T, chain: InvocationChain<T>): InvocationChain<T> {
    return chain.append(invocation);
  }

  /** @internal */
  private prefix(): string {
    return `${this.tail.toString()} => `;
  }

  static EmptyInvocationChain: typeof EmptyInvocationChain;
}

class EmptyInvocationChain extends InvocationChain<never> {
  static parent: typeof LinkedList = InvocationChain;

  constructor() {
    super(undefined as never, undefined as never);
  }

  override isEmpty(): boolean {
    return true;
  }

  static override cons<T>(head: T, tail: LinkedList<T>): LinkedList<T> {
    return this.parent.cons(head, tail);
  }

  override isMember(_obj: never): boolean {
    return false;
  }

  override append<T>(invocation: T): InvocationChain<T> {
    return this.conj(invocation as never) as unknown as InvocationChain<T>;
  }

  override toString(): string {
    return "TOP";
  }
}

InvocationChain.EmptyInvocationChain = EmptyInvocationChain;
InvocationChain.EMPTY = new EmptyInvocationChain();
