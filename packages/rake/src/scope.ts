import { LinkedList } from "./linked-list.js";
import { map } from "@blazetrails/ruby-compat";

export class Scope extends LinkedList<string> {
  declare readonly tail: Scope;
  declare static EmptyScope: typeof EmptyScope;

  get path(): string {
    return map(this, (item) => String(item))
      .reverse()
      .join(":");
  }

  pathWithTaskName(taskName: string): string {
    return `${this.path}:${taskName}`;
  }

  trim(n: number): Scope {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let result: Scope = this;
    while (n > 0 && !result.isEmpty()) {
      result = result.tail;
      n -= 1;
    }
    return result;
  }
}

class EmptyScope extends LinkedList.EmptyLinkedList {
  static override parent: typeof LinkedList = Scope as unknown as typeof LinkedList;

  get path(): string {
    return "";
  }

  pathWithTaskName(taskName: string): string {
    return taskName;
  }
}

Scope.EmptyScope = EmptyScope;
Scope.EMPTY = new EmptyScope() as never;
