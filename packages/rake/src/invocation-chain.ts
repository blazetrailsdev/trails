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

class EmptyInvocationChain extends LinkedList.EmptyLinkedList {
  static override parent: typeof LinkedList = InvocationChain;

  isMember(_obj: unknown): boolean {
    return false;
  }

  append<T>(invocation: T): InvocationChain<T> {
    return this.conj(invocation as never) as unknown as InvocationChain<T>;
  }

  override toString(): string {
    return "TOP";
  }
}

InvocationChain.EmptyInvocationChain = EmptyInvocationChain;
InvocationChain.EMPTY = new EmptyInvocationChain() as unknown as InvocationChain<never>;
