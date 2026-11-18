import { ActionCable } from "@blazetrails/actioncable";
import type { ActionController } from "@blazetrails/actionpack";
import {
  compactBlank,
  extractOptionsBang,
  isPresent,
  type SafeBuffer,
} from "@blazetrails/activesupport";
import { TopLevel, constGet, include } from "@blazetrails/ruby-compat";
import { Turbo } from "../../../../turbo-trails.js";
import { ActionHelper } from "../../../helpers/turbo/streams/action-helper.js";
import { ThreadDebouncer } from "../../../models/turbo/thread-debouncer.js";

type Options = Record<string, unknown>;
type BroadcastingServer = { broadcast(broadcasting: string, message: unknown): Promise<unknown> };

interface BroadcastsHost {
  broadcastActionTo(...streamables: unknown[]): Promise<unknown>;
  broadcastActionLaterTo(...streamables: unknown[]): Promise<unknown>;
  broadcastStreamTo(...streamables: unknown[]): Promise<unknown>;
  refreshDebouncerFor(...streamables: unknown[]): ThreadDebouncer;
  streamNameFrom(streamables: unknown): string;
  turboStreamActionTag(action: string, options?: Options): SafeBuffer;
  turboStreamRefreshTag(options?: Options): SafeBuffer;
  convertToTurboStreamDomId(target: unknown, options?: { includeSelector?: boolean }): unknown;
  renderFormat(format: string, rendering?: Options): Promise<unknown>;
  renderBroadcastAction(rendering: Options): Promise<unknown>;
}

export const Broadcasts = {
  broadcastRemoveTo(this: BroadcastsHost, ...streamables: unknown[]): Promise<unknown> {
    const opts = extractOptionsBang(streamables);
    return this.broadcastActionTo(...streamables, { action: "remove", render: false, ...opts });
  },

  broadcastReplaceTo(this: BroadcastsHost, ...streamables: unknown[]): Promise<unknown> {
    const opts = extractOptionsBang(streamables);
    return this.broadcastActionTo(...streamables, { action: "replace", ...opts });
  },

  broadcastUpdateTo(this: BroadcastsHost, ...streamables: unknown[]): Promise<unknown> {
    const opts = extractOptionsBang(streamables);
    return this.broadcastActionTo(...streamables, { action: "update", ...opts });
  },

  broadcastBeforeTo(this: BroadcastsHost, ...streamables: unknown[]): Promise<unknown> {
    const opts = extractOptionsBang(streamables);
    return this.broadcastActionTo(...streamables, { action: "before", ...opts });
  },

  broadcastAfterTo(this: BroadcastsHost, ...streamables: unknown[]): Promise<unknown> {
    const opts = extractOptionsBang(streamables);
    return this.broadcastActionTo(...streamables, { action: "after", ...opts });
  },

  broadcastAppendTo(this: BroadcastsHost, ...streamables: unknown[]): Promise<unknown> {
    const opts = extractOptionsBang(streamables);
    return this.broadcastActionTo(...streamables, { action: "append", ...opts });
  },

  broadcastPrependTo(this: BroadcastsHost, ...streamables: unknown[]): Promise<unknown> {
    const opts = extractOptionsBang(streamables);
    return this.broadcastActionTo(...streamables, { action: "prepend", ...opts });
  },

  broadcastRefreshTo(this: BroadcastsHost, ...streamables: unknown[]): Promise<unknown> {
    const attributes = extractOptionsBang(streamables);
    return this.broadcastStreamTo(...streamables, {
      content: this.turboStreamRefreshTag(attributes),
    });
  },

  async broadcastActionTo(this: BroadcastsHost, ...streamables: unknown[]): Promise<unknown> {
    const {
      action,
      target = null,
      targets = null,
      attributes = {},
      ...rendering
    } = extractOptionsBang(streamables);
    return await this.broadcastStreamTo(...streamables, {
      content: this.turboStreamActionTag(action as string, {
        target,
        targets,
        template: await this.renderBroadcastAction(rendering),
        ...(attributes as Options),
      }),
    });
  },

  broadcastReplaceLaterTo(this: BroadcastsHost, ...streamables: unknown[]): Promise<unknown> {
    const opts = extractOptionsBang(streamables);
    return this.broadcastActionLaterTo(...streamables, { action: "replace", ...opts });
  },

  broadcastUpdateLaterTo(this: BroadcastsHost, ...streamables: unknown[]): Promise<unknown> {
    const opts = extractOptionsBang(streamables);
    return this.broadcastActionLaterTo(...streamables, { action: "update", ...opts });
  },

  broadcastBeforeLaterTo(this: BroadcastsHost, ...streamables: unknown[]): Promise<unknown> {
    const opts = extractOptionsBang(streamables);
    return this.broadcastActionLaterTo(...streamables, { action: "before", ...opts });
  },

  broadcastAfterLaterTo(this: BroadcastsHost, ...streamables: unknown[]): Promise<unknown> {
    const opts = extractOptionsBang(streamables);
    return this.broadcastActionLaterTo(...streamables, { action: "after", ...opts });
  },

  broadcastAppendLaterTo(this: BroadcastsHost, ...streamables: unknown[]): Promise<unknown> {
    const opts = extractOptionsBang(streamables);
    return this.broadcastActionLaterTo(...streamables, { action: "append", ...opts });
  },

  broadcastPrependLaterTo(this: BroadcastsHost, ...streamables: unknown[]): Promise<unknown> {
    const opts = extractOptionsBang(streamables);
    return this.broadcastActionLaterTo(...streamables, { action: "prepend", ...opts });
  },

  broadcastRefreshLaterTo(this: BroadcastsHost, ...streamables: unknown[]): unknown {
    const { requestId = Turbo.currentRequestId, ...opts } = extractOptionsBang(streamables);
    const streamName = this.streamNameFrom(streamables);

    return this.refreshDebouncerFor(...streamables, { requestId }).debounce(() =>
      Turbo.Streams.BroadcastStreamJob!.performLater(streamName, {
        content: this.turboStreamRefreshTag({ requestId, ...opts }).toStr(),
      }),
    );
  },

  async broadcastActionLaterTo(this: BroadcastsHost, ...streamables: unknown[]): Promise<unknown> {
    const { action, attributes = {}, ...rendering } = extractOptionsBang(streamables);
    let { target = null, targets = null } = rendering;
    delete rendering.target;
    delete rendering.targets;
    streamables = compactBlank(streamables.flat(Infinity));

    if (isPresent(streamables)) {
      target = this.convertToTurboStreamDomId(target);
      targets = this.convertToTurboStreamDomId(targets, { includeSelector: true });
      return await Turbo.Streams.ActionBroadcastJob!.performLater(
        this.streamNameFrom(streamables),
        {
          action,
          target,
          targets,
          attributes,
          ...rendering,
        },
      );
    }
    return null;
  },

  async broadcastRenderTo(this: BroadcastsHost, ...streamables: unknown[]): Promise<unknown> {
    const rendering = extractOptionsBang(streamables);
    return await this.broadcastStreamTo(...streamables, {
      content: await this.renderFormat(":turbo_stream", rendering),
    });
  },

  broadcastRenderLaterTo(this: BroadcastsHost, ...streamables: unknown[]): Promise<unknown> {
    const rendering = extractOptionsBang(streamables);
    return Turbo.Streams.BroadcastJob!.performLater(this.streamNameFrom(streamables), rendering);
  },

  async broadcastStreamTo(this: BroadcastsHost, ...streamables: unknown[]): Promise<unknown> {
    const { content } = extractOptionsBang(streamables);
    streamables = compactBlank(streamables.flat(Infinity));

    if (isPresent(streamables)) {
      return await (ActionCable.server() as BroadcastingServer).broadcast(
        this.streamNameFrom(streamables),
        content,
      );
    }
    return null;
  },

  /** @internal */
  refreshDebouncerFor(this: BroadcastsHost, ...streamables: unknown[]): ThreadDebouncer {
    const { requestId = null } = extractOptionsBang(streamables);
    return ThreadDebouncer.for(
      `turbo-refresh-debouncer-${this.streamNameFrom([...streamables, requestId])}`,
    );
  },

  /** @internal */
  renderFormat(format: string, rendering: Options = {}): Promise<unknown> {
    return (constGet(TopLevel, "ApplicationController") as typeof ActionController.Base).render({
      formats: [format],
      ...rendering,
    }) as Promise<unknown>;
  },

  /** @internal */
  async renderBroadcastAction(this: BroadcastsHost, rendering: Options): Promise<unknown> {
    const { content = null, html = null, render = null, ...rest } = rendering;

    if (render === false) {
      return null;
    } else {
      if (content != null && content !== false) return content;
      if (html != null && html !== false) return html;
      return isPresent(rest) ? await this.renderFormat(":html", rest) : null;
    }
  },
};
include(Broadcasts, ActionHelper);
Turbo.Streams.Broadcasts = Broadcasts;
