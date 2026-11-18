import {
  ArgumentError,
  Concern,
  delegate,
  extend,
  extractOptionsBang,
  reverseMerge,
  threadMattrAccessor,
} from "@blazetrails/activesupport";
import { Turbo } from "../../../../turbo-trails.js";
import { StreamsChannel } from "../../../channels/turbo/streams-channel.js";
import type { Broadcasts } from "../../../channels/turbo/streams/broadcasts.js";

type Options = Record<string, unknown>;

const channel = (): typeof Broadcasts => StreamsChannel as unknown as typeof Broadcasts;

/** @internal */
export interface BroadcastableClassHost {
  suppressedTurboBroadcasts: boolean | null;
  modelName: { plural: string };
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
  broadcastTargetDefault(this: BroadcastableClassHost): string {
    return this.modelName.plural;
  },

  isSuppressedTurboBroadcasts(this: BroadcastableClassHost): boolean | null {
    return this.suppressedTurboBroadcasts;
  },
};

export const Broadcastable = {
  ClassMethods,

  async broadcastRemoveTo(this: Host, ...streamables: unknown[]): Promise<unknown> {
    const { target = this, ...rendering } = extractOptionsBang(streamables);
    if (!this.isSuppressedTurboBroadcasts())
      return await channel().broadcastRemoveTo.call(
        StreamsChannel as never,
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
      return await channel().broadcastReplaceTo.call(
        StreamsChannel as never,
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
      return await channel().broadcastUpdateTo.call(
        StreamsChannel as never,
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
      return await channel().broadcastBeforeTo.call(
        StreamsChannel as never,
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
      return await channel().broadcastAfterTo.call(
        StreamsChannel as never,
        ...streamables,
        this.extractOptionsAndAddTarget({ ...rendering, target: target, targets: targets }),
      );
    return null;
  },

  async broadcastAppendTo(this: Host, ...streamables: unknown[]): Promise<unknown> {
    const { target = this.broadcastTargetDefault(), ...rendering } =
      extractOptionsBang(streamables);
    if (!this.isSuppressedTurboBroadcasts())
      return await channel().broadcastAppendTo.call(
        StreamsChannel as never,
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
      return await channel().broadcastPrependTo.call(
        StreamsChannel as never,
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
      return await channel().broadcastRefreshTo.call(
        StreamsChannel as never,
        ...streamables,
        attributes,
      );
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
      return await channel().broadcastActionTo.call(StreamsChannel as never, ...streamables, {
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
      return await channel().broadcastReplaceLaterTo.call(
        StreamsChannel as never,
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
      return await channel().broadcastUpdateLaterTo.call(
        StreamsChannel as never,
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
      return await channel().broadcastAppendLaterTo.call(
        StreamsChannel as never,
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
      return await channel().broadcastPrependLaterTo.call(
        StreamsChannel as never,
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
      return await channel().broadcastRefreshLaterTo.call(StreamsChannel as never, ...streamables, {
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
      return await channel().broadcastActionLaterTo.call(StreamsChannel as never, ...streamables, {
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
      return await channel().broadcastRenderTo.call(
        StreamsChannel as never,
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
      return await channel().broadcastRenderLaterTo.call(
        StreamsChannel as never,
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
    o.locals = reverseMerge((o.locals as Options | null | undefined) ?? {}, {
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
      o.partial ??= this.toPartialPath();
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
