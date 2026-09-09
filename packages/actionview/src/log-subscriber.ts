import {
  LogSubscriber as BaseLogSubscriber,
  Notifications,
  NotificationEvent as Event,
  trailsRoot,
} from "@blazetrails/activesupport";
import type { Logger, Subscriber } from "@blazetrails/activesupport";
import { round } from "@blazetrails/ruby-compat";

import { _Base } from "./base-slot.js";

const VIEWS_PATTERN = /^app\/views\//;

/** @internal */
export interface UtilsHost {
  root: string | null;
}

/** @internal */
export function logger(): Logger | null {
  return (_Base?.logger ?? null) as Logger | null;
}

/** @internal */
export function fromRailsRoot(this: UtilsHost, string: string): string {
  string = string.replace(railsRoot.call(this), "");
  string = string.replace(VIEWS_PATTERN, "");
  return string;
}

/** @internal */
export function railsRoot(this: UtilsHost): string {
  this.root ??= `${trailsRoot() ?? ""}/`;
  return this.root;
}

/** @internal */
export class Start implements UtilsHost {
  root: string | null = null;

  /** @internal */
  logger = logger;
  /** @internal */
  fromRailsRoot = fromRailsRoot;
  /** @internal */
  railsRoot = railsRoot;

  start(name: string, id: unknown, payload: Record<string, unknown>): void {
    if (!this.logger()) return;
    let qualifier: string | undefined;
    if (name === "render_template.action_view") {
      qualifier = "";
    } else if (name === "render_layout.action_view") {
      qualifier = "layout ";
    }

    if (qualifier === undefined) return;

    this.logger()!.debug(() => {
      let message = `  Rendering ${qualifier}${this.fromRailsRoot(payload["identifier"] as string)}`;
      if (payload["layout"] != null && payload["layout"] !== false) {
        message += ` within ${this.fromRailsRoot(payload["layout"] as string)}`;
      }
      return message;
    });
  }

  finish(_name: string, _id: unknown, _payload: Record<string, unknown>): void {}

  /**
   * @internal
   * @missingRailsCall debug? — PERMANENT
   */
  isSilenced(_: unknown): boolean {
    const l = this.logger();
    return l == null || !l["debug?"];
  }
}

export class LogSubscriber extends BaseLogSubscriber implements UtilsHost {
  root: string | null;

  /** @internal */
  fromRailsRoot = fromRailsRoot;
  /** @internal */
  railsRoot = railsRoot;

  constructor() {
    super();
    this.root = null;
  }

  override get logger(): Logger | null {
    return logger();
  }

  /** @missingRailsArgs round — PERMANENT */
  renderTemplate(event: Event): void {
    this._info(() => {
      let message = `  Rendered ${this.fromRailsRoot(event.payload["identifier"] as string)}`;
      if (event.payload["layout"] != null && event.payload["layout"] !== false) {
        message += ` within ${this.fromRailsRoot(event.payload["layout"] as string)}`;
      }
      message += ` (Duration: ${round(event.duration, 1)}ms | GC: ${round(event.gcTime, 1)}ms)`;
      return message;
    });
  }

  /** @missingRailsArgs round — PERMANENT */
  renderPartial(event: Event): void {
    this._debug(() => {
      let message = `  Rendered ${this.fromRailsRoot(event.payload["identifier"] as string)}`;
      if (event.payload["layout"] != null && event.payload["layout"] !== false) {
        message += ` within ${this.fromRailsRoot(event.payload["layout"] as string)}`;
      }
      message += ` (Duration: ${round(event.duration, 1)}ms | GC: ${round(event.gcTime, 1)}ms)`;
      if (event.payload["cache_hit"] != null) {
        message += ` ${this.cacheMessage(event.payload) ?? ""}`;
      }
      return message;
    });
  }

  /** @missingRailsArgs round — PERMANENT */
  renderLayout(event: Event): void {
    this._info(() => {
      let message = `  Rendered layout ${this.fromRailsRoot(event.payload["identifier"] as string)}`;
      message += ` (Duration: ${round(event.duration, 1)}ms | GC: ${round(event.gcTime, 1)}ms)`;
      return message;
    });
  }

  /** @missingRailsArgs round — PERMANENT */
  renderCollection(event: Event): void {
    const identifier =
      event.payload["identifier"] != null && event.payload["identifier"] !== false
        ? (event.payload["identifier"] as string)
        : "templates";

    this._debug(() => {
      let message = `  Rendered collection of ${this.fromRailsRoot(identifier)}`;
      if (event.payload["layout"] != null && event.payload["layout"] !== false) {
        message += ` within ${this.fromRailsRoot(event.payload["layout"] as string)}`;
      }
      message += ` ${this.renderCount(event.payload)} (Duration: ${round(event.duration, 1)}ms | GC: ${round(event.gcTime, 1)}ms)`;
      return message;
    });
  }

  static override attachTo(...args: Parameters<typeof BaseLogSubscriber.attachTo>): Subscriber {
    Notifications.subscribe("render_template.action_view", new Start());
    Notifications.subscribe("render_layout.action_view", new Start());

    return super.attachTo(...args);
  }

  /** @internal */
  renderCount(payload: Record<string, unknown>): string {
    if (payload["cache_hits"] != null && payload["cache_hits"] !== false) {
      return `[${payload["cache_hits"]} / ${payload["count"]} cache hits]`;
    } else {
      return `[${payload["count"]} times]`;
    }
  }

  /** @internal */
  cacheMessage(payload: Record<string, unknown>): string | undefined {
    switch (payload["cache_hit"]) {
      case ":hit":
        return "[cache hit]";
      case ":miss":
        return "[cache miss]";
    }
    return undefined;
  }
}

LogSubscriber.subscribeLogLevel("render_template", "debug");
LogSubscriber.subscribeLogLevel("render_partial", "debug");
LogSubscriber.subscribeLogLevel("render_layout", "info");
LogSubscriber.subscribeLogLevel("render_collection", "debug");

LogSubscriber.attachTo("action_view");
