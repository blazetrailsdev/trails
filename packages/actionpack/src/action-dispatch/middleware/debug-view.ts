/**
 * ActionDispatch::DebugView
 *
 * Mirrors Rails `action_dispatch/middleware/debug_view.rb`.
 *
 * In Rails, DebugView extends ActionView::Base and is used by
 * DebugExceptions to render error pages. ActionView::Base is not yet
 * ported in trails, so this port provides the DebugView helper surface
 * (debugParams / debugHeaders / debugHash / paramsValid /
 * protectAgainstForgery / compiledMethodContainer) as a standalone
 * class. Once ActionView::Base lands, DebugView should be re-derived
 * from it and its `render` (logger-silence wrapper around super)
 * ported alongside.
 */

import { BadRequest } from "../../action-controller/metal/exceptions.js";

const TEMPLATES_URL = new URL("./templates", import.meta.url).href;

interface ParamsRequestLike {
  parameters: unknown;
}

export class DebugView {
  static readonly RESCUES_TEMPLATE_PATHS: readonly string[] = [TEMPLATES_URL];

  /** @internal */
  protected readonly assigns: Record<string, unknown>;
  /** @internal */
  protected readonly _request: ParamsRequestLike | undefined;

  constructor(assigns: Record<string, unknown>) {
    this.assigns = assigns;
    this._request = assigns["request"] as ParamsRequestLike | undefined;
  }

  /** @internal */
  compiledMethodContainer(): typeof DebugView {
    return this.constructor as typeof DebugView;
  }

  debugParams(params: Record<string, unknown>): string {
    const cleanParams = { ...params };
    delete cleanParams["action"];
    delete cleanParams["controller"];

    if (Object.keys(cleanParams).length === 0) {
      return "None";
    }
    return prettyPrint(cleanParams, 200);
  }

  debugHeaders(headers: Record<string, unknown> | null | undefined): string {
    if (headers && Object.keys(headers).length > 0) {
      return inspect(headers).replace(/,/g, ",\n");
    }
    return "None";
  }

  debugHash(object: { toHash?: () => Record<string, unknown> } | Record<string, unknown>): string {
    const hash =
      typeof (object as { toHash?: () => Record<string, unknown> }).toHash === "function"
        ? (object as { toHash: () => Record<string, unknown> }).toHash()
        : (object as Record<string, unknown>);
    const keys = Object.keys(hash).sort();
    return keys
      .map((k) => {
        let valueInspected: string;
        try {
          valueInspected = inspect(hash[k]);
        } catch (e) {
          valueInspected = (e as Error).message;
        }
        return `${k}: ${valueInspected}`;
      })
      .join("\n");
  }

  protectAgainstForgery(): boolean {
    return false;
  }

  paramsValid(): boolean {
    try {
      return Boolean(this._request?.parameters);
    } catch (e) {
      if (e instanceof BadRequest) return false;
      throw e;
    }
  }
}

/** @internal */
function inspect(value: unknown): string {
  if (value === null) return "nil";
  if (value === undefined) return "nil";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map(inspect).join(", ")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([k, v]) => `${JSON.stringify(k)}=>${inspect(v)}`,
    );
    return `{${entries.join(", ")}}`;
  }
  return String(value);
}

/** @internal */
function prettyPrint(value: unknown, width: number): string {
  const single = inspect(value);
  if (single.length <= width) return single;
  return JSON.stringify(value, null, 2);
}
