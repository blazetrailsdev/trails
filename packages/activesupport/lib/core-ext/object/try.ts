import { rbBlockGivenP } from "@blazetrails/ruby-compat/hash";
import { rbFSend, rbObjRespondTo } from "@blazetrails/ruby-compat/object";

type TryBlock = (this: unknown, self?: unknown) => unknown;

export interface Tryable {
  try(...args: [...unknown[], TryBlock] | unknown[]): unknown;
  tryBang(...args: [...unknown[], TryBlock] | unknown[]): unknown;
}

export const Tryable = {
  try(obj: unknown, ...args: [...unknown[], TryBlock] | unknown[]): unknown {
    if (obj == null) return null;
    const block = args.at(-1) as TryBlock | undefined;
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

  tryBang(obj: unknown, ...args: [...unknown[], TryBlock] | unknown[]): unknown {
    if (obj == null) return null;
    const block = args.at(-1) as TryBlock | undefined;
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

  try(...args: [...unknown[], TryBlock] | unknown[]): unknown {
    const method = args[0];
    return Tryable.try(
      typeof method !== "string" || method in this ? this : this._delegate,
      ...args,
    );
  }

  tryBang(...args: [...unknown[], TryBlock] | unknown[]): unknown {
    const method = args[0];
    return Tryable.tryBang(
      typeof method !== "string" || method in this ? this : this._delegate,
      ...args,
    );
  }
}
