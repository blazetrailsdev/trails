import { TopLevel } from "@blazetrails/ruby-compat";

import type { ListenerBlock } from "./listener.js";

import { Listener, type ListenerOptions } from "./listener.js";

export { Listener, type ListenerBlock, type ListenerOptions } from "./listener.js";

const listeners: WeakRef<Listener>[] = [];

export const Listen = {
  Listener,

  to(...args: (string | ListenerOptions | ListenerBlock)[]): Listener {
    const listener = new Listener(...args);
    listeners.push(new WeakRef(listener));
    return listener;
  },

  async stop(): Promise<void> {
    let ref: WeakRef<Listener> | undefined;
    while ((ref = listeners.shift()) != null) {
      await ref.deref()?.stop();
    }
  },
};
TopLevel.Listen = Listen;

declare module "@blazetrails/ruby-compat" {
  interface TopLevelConstants {
    Listen?: typeof Listen;
  }
}

import "./constants.generated.js";
