import { rbFSend, rbObjRespondTo } from "@blazetrails/ruby-compat";

export interface Tryable {
  try(method: string, ...args: unknown[]): unknown;
  tryBang(method: string, ...args: unknown[]): unknown;
}

export const Tryable = {
  try(obj: unknown, ...args: unknown[]): unknown {
    if (obj == null) return undefined;
    if (rbObjRespondTo(obj, args[0] as string)) {
      return rbFSend(obj, ...(args as [string, ...unknown[]]));
    }
    return undefined;
  },

  tryBang(obj: unknown, ...args: unknown[]): unknown {
    if (obj == null) return undefined;
    return rbFSend(obj, ...(args as [string, ...unknown[]]));
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
