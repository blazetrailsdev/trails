import {
  ArgumentError,
  Concern,
  delegate,
  extend,
  extractOptionsBang,
  reverseMerge,
  threadMattrAccessor,
} from "@blazetrails/activesupport";
import { rbFSend, rbObjRespondTo, rbProcCall, rtest } from "@blazetrails/ruby-compat";
import { Turbo } from "../../../../turbo-trails.js";
import type {} from "@blazetrails/activerecord/base.js";

type Options = Record<string, unknown>;

/** @internal */
export interface BroadcastableClassHost {
  suppressedTurboBroadcasts: boolean | null;
  modelName: { plural: string };
  broadcastTargetDefault(): string;
  afterCommit(callback: (this: Host) => unknown): void;
  afterCreateCommit(callback: (this: Host) => unknown): void;
  afterUpdateCommit(callback: (this: Host) => unknown): void;
  afterDestroyCommit(callback: (this: Host) => unknown): void;
}

/** @internal */
export interface BroadcastableHost {
  constructor: { broadcastTargetDefault(): string };
  modelName: { element: string };
  toPartialPath(): string;
  isSuppressedTurboBroadcasts(): boolean;
  broadcastTargetDefault(): string;
  extractOptionsAndAddTarget(rendering?: Options, options?: { target?: unknown }): Options;
  broadcastRenderingWithDefaults(options: Options): Options;
  [method: string]: unknown;
}

type Host = BroadcastableHost & Record<string, (...args: unknown[]) => Promise<unknown>>;

export const ClassMethods = {
  broadcastsTo(
    this: BroadcastableClassHost,
    stream: unknown,
    { insertsBy = "append", target = this.broadcastTargetDefault(), ...rendering }: Options = {},
  ): void {
    this.afterCreateCommit(function (this: Host) {
      const called = rbObjRespondTo(stream, "call") ? rbProcCall(stream, this) : null;
      const streamables = rtest(called) ? called : rbFSend(this, stream);
      const calledTarget = rbObjRespondTo(target, "call") ? rbProcCall(target, this) : null;
      return this.broadcastActionLaterTo(streamables, {
        action: insertsBy,
        target: rtest(calledTarget) ? calledTarget : target,
        ...rendering,
      });
    });
    this.afterUpdateCommit(function (this: Host) {
      const called = rbObjRespondTo(stream, "call") ? rbProcCall(stream, this) : null;
      return this.broadcastReplaceLaterTo(rtest(called) ? called : rbFSend(this, stream), {
        ...rendering,
      });
    });
    this.afterDestroyCommit(function (this: Host) {
      const called = rbObjRespondTo(stream, "call") ? rbProcCall(stream, this) : null;
      return this.broadcastRemoveTo(rtest(called) ? called : rbFSend(this, stream));
    });
  },

  broadcasts(
    this: BroadcastableClassHost,
    stream: unknown = this.modelName.plural,
    { insertsBy = "append", target = this.broadcastTargetDefault(), ...rendering }: Options = {},
  ): void {
    this.afterCreateCommit(function (this: Host) {
      const calledTarget = rbObjRespondTo(target, "call") ? rbProcCall(target, this) : null;
      return this.broadcastActionLaterTo(stream, {
        action: insertsBy,
        target: rtest(calledTarget) ? calledTarget : target,
        ...rendering,
      });
    });
    this.afterUpdateCommit(function (this: Host) {
      return this.broadcastReplaceLater({ ...rendering });
    });
    this.afterDestroyCommit(function (this: Host) {
      return this.broadcastRemove();
    });
  },

  broadcastsRefreshesTo(this: BroadcastableClassHost, stream: unknown): void {
    this.afterCommit(function (this: Host) {
      const called = rbObjRespondTo(stream, "call") ? rbProcCall(stream, this) : null;
      return this.broadcastRefreshLaterTo(rtest(called) ? called : rbFSend(this, stream));
    });
  },

  broadcastsRefreshes(this: BroadcastableClassHost, stream: unknown = this.modelName.plural): void {
    this.afterCreateCommit(function (this: Host) {
      return this.broadcastRefreshLaterTo(stream);
    });
    this.afterUpdateCommit(function (this: Host) {
      return this.broadcastRefreshLater();
    });
    this.afterDestroyCommit(function (this: Host) {
      return this.broadcastRefresh();
    });
  },

  broadcastTargetDefault(this: BroadcastableClassHost): string {
    return this.modelName.plural;
  },

  async suppressingTurboBroadcasts<T>(
    this: BroadcastableClassHost,
    block: () => T | Promise<T>,
  ): Promise<T> {
    const original = this.suppressedTurboBroadcasts;
    this.suppressedTurboBroadcasts = true;
    try {
      return await block();
    } finally {
      this.suppressedTurboBroadcasts = original;
    }
  },

  isSuppressedTurboBroadcasts(this: BroadcastableClassHost): boolean | null {
    return this.suppressedTurboBroadcasts;
  },
};

declare module "@blazetrails/activerecord/base.js" {
  namespace Base {
    const broadcastsTo: typeof ClassMethods.broadcastsTo;
    const broadcasts: typeof ClassMethods.broadcasts;
    const broadcastsRefreshesTo: typeof ClassMethods.broadcastsRefreshesTo;
    const broadcastsRefreshes: typeof ClassMethods.broadcastsRefreshes;
    const broadcastTargetDefault: typeof ClassMethods.broadcastTargetDefault;
    const suppressingTurboBroadcasts: typeof ClassMethods.suppressingTurboBroadcasts;
    const isSuppressedTurboBroadcasts: typeof ClassMethods.isSuppressedTurboBroadcasts;
    let suppressedTurboBroadcasts: boolean | null;
  }
}

export const Broadcastable = {
  ClassMethods,

  async broadcastRemoveTo(this: Host, ...streamables: unknown[]): Promise<unknown> {
    const { target = this, ...rendering } = extractOptionsBang(streamables);
    if (!this.isSuppressedTurboBroadcasts())
      return await Turbo.StreamsChannel!.broadcastRemoveTo(
        ...streamables,
        this.extractOptionsAndAddTarget(rendering, { target: target }),
      );
    return null;
  },

  broadcastRemove(this: Host, rendering: Options = {}): Promise<unknown> {
    return this.broadcastRemoveTo(this, rendering);
  },

  async broadcastReplaceTo(this: Host, ...streamables: unknown[]): Promise<unknown> {
    const rendering = extractOptionsBang(streamables);
    if (!this.isSuppressedTurboBroadcasts())
      return await Turbo.StreamsChannel!.broadcastReplaceTo(
        ...streamables,
        this.extractOptionsAndAddTarget(rendering, { target: this }),
      );
    return null;
  },

  broadcastReplace(this: Host, rendering: Options = {}): Promise<unknown> {
    return this.broadcastReplaceTo(this, rendering);
  },

  async broadcastUpdateTo(this: Host, ...streamables: unknown[]): Promise<unknown> {
    const rendering = extractOptionsBang(streamables);
    if (!this.isSuppressedTurboBroadcasts())
      return await Turbo.StreamsChannel!.broadcastUpdateTo(
        ...streamables,
        this.extractOptionsAndAddTarget(rendering, { target: this }),
      );
    return null;
  },

  broadcastUpdate(this: Host, rendering: Options = {}): Promise<unknown> {
    return this.broadcastUpdateTo(this, rendering);
  },

  async broadcastBeforeTo(this: Host, ...streamables: unknown[]): Promise<unknown> {
    const { target = null, targets = null, ...rendering } = extractOptionsBang(streamables);
    if (!(target != null && target !== false) && !(targets != null && targets !== false))
      throw new ArgumentError("at least one of target or targets is required");

    if (!this.isSuppressedTurboBroadcasts())
      return await Turbo.StreamsChannel!.broadcastBeforeTo(
        ...streamables,
        this.extractOptionsAndAddTarget({ ...rendering, target: target, targets: targets }),
      );
    return null;
  },

  async broadcastAfterTo(this: Host, ...streamables: unknown[]): Promise<unknown> {
    const { target = null, targets = null, ...rendering } = extractOptionsBang(streamables);
    if (!(target != null && target !== false) && !(targets != null && targets !== false))
      throw new ArgumentError("at least one of target or targets is required");

    if (!this.isSuppressedTurboBroadcasts())
      return await Turbo.StreamsChannel!.broadcastAfterTo(
        ...streamables,
        this.extractOptionsAndAddTarget({ ...rendering, target: target, targets: targets }),
      );
    return null;
  },

  async broadcastAppendTo(this: Host, ...streamables: unknown[]): Promise<unknown> {
    const { target = this.broadcastTargetDefault(), ...rendering } =
      extractOptionsBang(streamables);
    if (!this.isSuppressedTurboBroadcasts())
      return await Turbo.StreamsChannel!.broadcastAppendTo(
        ...streamables,
        this.extractOptionsAndAddTarget(rendering, { target: target }),
      );
    return null;
  },

  broadcastAppend(
    this: Host,
    { target = this.broadcastTargetDefault(), ...rendering }: Options = {},
  ): Promise<unknown> {
    return this.broadcastAppendTo(this, { target: target, ...rendering });
  },

  async broadcastPrependTo(this: Host, ...streamables: unknown[]): Promise<unknown> {
    const { target = this.broadcastTargetDefault(), ...rendering } =
      extractOptionsBang(streamables);
    if (!this.isSuppressedTurboBroadcasts())
      return await Turbo.StreamsChannel!.broadcastPrependTo(
        ...streamables,
        this.extractOptionsAndAddTarget(rendering, { target: target }),
      );
    return null;
  },

  broadcastPrepend(
    this: Host,
    { target = this.broadcastTargetDefault(), ...rendering }: Options = {},
  ): Promise<unknown> {
    return this.broadcastPrependTo(this, { target: target, ...rendering });
  },

  async broadcastRefreshTo(this: Host, ...streamables: unknown[]): Promise<unknown> {
    const attributes = extractOptionsBang(streamables);
    if (!this.isSuppressedTurboBroadcasts())
      return await Turbo.StreamsChannel!.broadcastRefreshTo(...streamables, attributes);
    return null;
  },

  broadcastRefresh(this: Host): Promise<unknown> {
    return this.broadcastRefreshTo(this);
  },

  async broadcastActionTo(this: Host, ...streamables: unknown[]): Promise<unknown> {
    const {
      action,
      target = this.broadcastTargetDefault(),
      attributes = {},
      ...rendering
    } = extractOptionsBang(streamables);
    if (!this.isSuppressedTurboBroadcasts())
      return await Turbo.StreamsChannel!.broadcastActionTo(...streamables, {
        action: action,
        attributes: attributes,
        ...this.extractOptionsAndAddTarget(rendering, { target: target }),
      });
    return null;
  },

  broadcastAction(
    this: Host,
    action: unknown,
    { target = this.broadcastTargetDefault(), attributes = {}, ...rendering }: Options = {},
  ): Promise<unknown> {
    return this.broadcastActionTo(this, {
      action: action,
      target: target,
      attributes: attributes,
      ...rendering,
    });
  },

  async broadcastReplaceLaterTo(this: Host, ...streamables: unknown[]): Promise<unknown> {
    const rendering = extractOptionsBang(streamables);
    if (!this.isSuppressedTurboBroadcasts())
      return await Turbo.StreamsChannel!.broadcastReplaceLaterTo(
        ...streamables,
        this.extractOptionsAndAddTarget(rendering, { target: this }),
      );
    return null;
  },

  broadcastReplaceLater(this: Host, rendering: Options = {}): Promise<unknown> {
    return this.broadcastReplaceLaterTo(this, rendering);
  },

  async broadcastUpdateLaterTo(this: Host, ...streamables: unknown[]): Promise<unknown> {
    const rendering = extractOptionsBang(streamables);
    if (!this.isSuppressedTurboBroadcasts())
      return await Turbo.StreamsChannel!.broadcastUpdateLaterTo(
        ...streamables,
        this.extractOptionsAndAddTarget(rendering, { target: this }),
      );
    return null;
  },

  broadcastUpdateLater(this: Host, rendering: Options = {}): Promise<unknown> {
    return this.broadcastUpdateLaterTo(this, rendering);
  },

  async broadcastAppendLaterTo(this: Host, ...streamables: unknown[]): Promise<unknown> {
    const { target = this.broadcastTargetDefault(), ...rendering } =
      extractOptionsBang(streamables);
    if (!this.isSuppressedTurboBroadcasts())
      return await Turbo.StreamsChannel!.broadcastAppendLaterTo(
        ...streamables,
        this.extractOptionsAndAddTarget(rendering, { target: target }),
      );
    return null;
  },

  broadcastAppendLater(
    this: Host,
    { target = this.broadcastTargetDefault(), ...rendering }: Options = {},
  ): Promise<unknown> {
    return this.broadcastAppendLaterTo(this, { target: target, ...rendering });
  },

  async broadcastPrependLaterTo(this: Host, ...streamables: unknown[]): Promise<unknown> {
    const { target = this.broadcastTargetDefault(), ...rendering } =
      extractOptionsBang(streamables);
    if (!this.isSuppressedTurboBroadcasts())
      return await Turbo.StreamsChannel!.broadcastPrependLaterTo(
        ...streamables,
        this.extractOptionsAndAddTarget(rendering, { target: target }),
      );
    return null;
  },

  broadcastPrependLater(
    this: Host,
    { target = this.broadcastTargetDefault(), ...rendering }: Options = {},
  ): Promise<unknown> {
    return this.broadcastPrependLaterTo(this, { target: target, ...rendering });
  },

  async broadcastRefreshLaterTo(this: Host, ...streamables: unknown[]): Promise<unknown> {
    const attributes = extractOptionsBang(streamables);
    if (!this.isSuppressedTurboBroadcasts())
      return await Turbo.StreamsChannel!.broadcastRefreshLaterTo(...streamables, {
        requestId: Turbo.currentRequestId,
        ...attributes,
      });
    return null;
  },

  broadcastRefreshLater(this: Host): Promise<unknown> {
    return this.broadcastRefreshLaterTo(this);
  },

  async broadcastActionLaterTo(this: Host, ...streamables: unknown[]): Promise<unknown> {
    const {
      action,
      target = this.broadcastTargetDefault(),
      attributes = {},
      ...rendering
    } = extractOptionsBang(streamables);
    if (!this.isSuppressedTurboBroadcasts())
      return await Turbo.StreamsChannel!.broadcastActionLaterTo(...streamables, {
        action: action,
        attributes: attributes,
        ...this.extractOptionsAndAddTarget(rendering, { target: target }),
      });
    return null;
  },

  broadcastActionLater(
    this: Host,
    { action, target = this.broadcastTargetDefault(), attributes = {}, ...rendering }: Options,
  ): Promise<unknown> {
    return this.broadcastActionLaterTo(this, {
      action: action,
      target: target,
      attributes: attributes,
      ...rendering,
    });
  },

  broadcastRender(this: Host, rendering: Options = {}): Promise<unknown> {
    return this.broadcastRenderTo(this, rendering);
  },

  async broadcastRenderTo(this: Host, ...streamables: unknown[]): Promise<unknown> {
    const rendering = extractOptionsBang(streamables);
    if (!this.isSuppressedTurboBroadcasts())
      return await Turbo.StreamsChannel!.broadcastRenderTo(
        ...streamables,
        this.extractOptionsAndAddTarget(rendering, { target: this }),
      );
    return null;
  },

  broadcastRenderLater(this: Host, rendering: Options = {}): Promise<unknown> {
    return this.broadcastRenderLaterTo(this, rendering);
  },

  async broadcastRenderLaterTo(this: Host, ...streamables: unknown[]): Promise<unknown> {
    const rendering = extractOptionsBang(streamables);
    if (!this.isSuppressedTurboBroadcasts())
      return await Turbo.StreamsChannel!.broadcastRenderLaterTo(
        ...streamables,
        this.extractOptionsAndAddTarget(rendering),
      );
    return null;
  },

  /** @internal */
  broadcastTargetDefault(this: BroadcastableHost): string {
    return this.constructor.broadcastTargetDefault();
  },

  /** @internal */
  extractOptionsAndAddTarget(
    this: BroadcastableHost,
    rendering: Options = {},
    { target = this.broadcastTargetDefault() }: { target?: unknown } = {},
  ): Options {
    const options = this.broadcastRenderingWithDefaults(rendering);
    if (!("target" in options) && !("targets" in options)) options.target = target;
    return options;
  },

  /** @internal */
  broadcastRenderingWithDefaults(this: BroadcastableHost, options: Options): Options {
    const o = options;
    o.locals = reverseMerge(o.locals != null && o.locals !== false ? (o.locals as Options) : {}, {
      [this.modelName.element]: this,
    });

    if ((o.html != null && o.html !== false) || (o.partial != null && o.partial !== false)) {
      return o;
    } else if (
      (o.template != null && o.template !== false) ||
      (o.renderable != null && o.renderable !== false)
    ) {
      o.layout = false;
    } else if (o.render === false) {
      return o;
    } else {
      if (o.partial == null || o.partial === false) o.partial = this.toPartialPath();
    }
    return o;
  },
};
extend(Broadcastable, Concern);
(
  Broadcastable as unknown as {
    included(base: null, block: (this: { prototype: object }) => void): void;
  }
).included(null, function (this: { prototype: object }) {
  threadMattrAccessor.call(this as never, "suppressedTurboBroadcasts", { instanceAccessor: false });
  delegate.call(this.prototype, "isSuppressedTurboBroadcasts", { to: "self.class" });
});
Turbo.Broadcastable = Broadcastable;
