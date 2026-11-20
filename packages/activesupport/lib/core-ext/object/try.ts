import { rbBlockGivenP, rbFSend, rbObjRespondTo } from "@blazetrails/ruby-compat";

export interface Tryable {
  try(method: string, ...args: unknown[]): unknown;
  tryBang(method: string, ...args: unknown[]): unknown;
}

export const Tryable = {
  try(obj: unknown, ...args: unknown[]): unknown {
    if (obj == null) return null;
    const block = args.at(-1) as ((this: unknown, self?: unknown) => unknown) | undefined;
    if (args.length === 1 && rbBlockGivenP(block)) {
      if (block.length === 0) {
        return Reflect.apply(block, obj, []);
      } else {
        return block(obj);
      }
    } else if (rbObjRespondTo(obj, args[0] as string)) {
      return rbFSend(obj, ...(args as [string, ...unknown[]]));
    }
    return null;
  },

  tryBang(obj: unknown, ...args: unknown[]): unknown {
    if (obj == null) return null;
    const block = args.at(-1) as ((this: unknown, self?: unknown) => unknown) | undefined;
    if (args.length === 1 && rbBlockGivenP(block)) {
      if (block.length === 0) {
        return Reflect.apply(block, obj, []);
      } else {
        return block(obj);
      }
    } else {
      return rbFSend(obj, ...(args as [string, ...unknown[]]));
    }
  },
};

export class Delegator implements Tryable {
  private _delegate: unknown;

  constructor(delegate: unknown) {
    this._delegate = delegate;
  }

  try(method: string, ...args: unknown[]): unknown {
    return Tryable.try(method in this ? this : this._delegate, method, ...args);
  }

  tryBang(method: string, ...args: unknown[]): unknown {
    return Tryable.tryBang(method in this ? this : this._delegate, method, ...args);
  }
}
