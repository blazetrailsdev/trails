/**
 * ActionController::ImplicitRender
 *
 * Handles implicit rendering for a controller action that does not
 * explicitly respond with render, respond_to, redirect, or head.
 * @see https://api.rubyonrails.org/classes/ActionController/ImplicitRender.html
 */

import { inspect } from "@blazetrails/activesupport";

import { UnknownFormat, MissingExactTemplate } from "./exceptions.js";

import {
  defaultRender as _defaultRender,
  sendAction as _sendAction,
} from "./basic-implicit-render.js";

/**
 * Rails `BasicImplicitRender#send_action` — re-exposed because
 * `ImplicitRender` includes `BasicImplicitRender`.
 *
 * @internal
 */
export function sendAction(
  this: { performed: boolean; head(status: number | string): void },
  method: () => unknown,
): unknown {
  return _sendAction.call(this, method);
}

export interface ImplicitRenderHost {
  performed: boolean;
  actionName: string;
  /** Rails' messages read `self.class.name`, not `controller_name`. */
  constructor: { name: string };
  request?: {
    /** Rails `request.get?` — a boolean getter on trails' `Request`. */
    isGet?: boolean;
    /** Rails compares `request.format == Mime[:html]`; `symbol` is the trails
     *  spelling, answered by both `MimeType` and `NullType`. */
    format?: { symbol?: string | null };
    /** Rails `request.xhr?` — a boolean getter on trails' `Request`. */
    xhr?: boolean;
    /** Rails `request.formats` — `Mime::Type`s, rendered by `to_s`. */
    formats?: ReadonlyArray<{ toString(): string }>;
    variant?: unknown;
  };
  _prefixes?(): string[];
  templateExists?(
    action: string,
    prefixes?: readonly string[],
    partial?: boolean,
    keys?: readonly string[],
    options?: Record<string, readonly (string | symbol)[]>,
  ): boolean;
  isAnyTemplates?(action: string, prefixes?: readonly string[]): boolean;
  head(status: number | string): void;
  render(): void;
  logger?: { info(msg: string): void };
}

/**
 * Rails `ImplicitRender#default_render` — picks a template, raises with
 * UnknownFormat / MissingExactTemplate, or falls back to `head :no_content`.
 *
 * @missingRailsArgs inspect — PERMANENT
 *   Ruby's `x.inspect` is a method on the receiver; TypeScript cannot reopen
 *   `Array`, so trails spells it as the free `inspect(x)` ActiveSupport
 *   exports (`core-ext/object/inspect.ts`) and the receiver moves into the
 *   argument list.
 * @internal
 */
export function defaultRender(this: ImplicitRenderHost): void {
  const name = this.constructor.name;
  if (
    this.templateExists?.(String(this.actionName), this._prefixes?.(), false, [], {
      variants: variantsFor(this.request?.variant),
    })
  ) {
    this.render();
    return;
  }
  if (this.isAnyTemplates?.(String(this.actionName), this._prefixes?.())) {
    const message =
      `${name}#${this.actionName} is missing a template ` +
      "for this request format and variant.\n" +
      `\nrequest.formats: ${inspect((this.request?.formats ?? []).map((f) => String(f)))}` +
      `\nrequest.variant: ${inspect(variantsFor(this.request?.variant))}`;

    throw new UnknownFormat(message);
  }
  if (isInteractiveBrowserRequest.call(this)) {
    const message = `${name}#${this.actionName} is missing a template for request formats: ${(this.request?.formats ?? []).map((f) => String(f)).join(",")}`;
    throw new MissingExactTemplate(message, this.constructor, this.actionName);
  }
  this.logger?.info(`No template found for ${name}#${this.actionName}, rendering head :no_content`);
  _defaultRender.call(this);
}

/**
 * `request.variant` is an `ActionController::RequestVariant` — an Array
 * subclass — so Rails' `variants: request.variant` kwarg already carries a
 * list (`action_controller/metal/implicit_render.rb:37`). trails' `variant` is
 * an `ArrayInquirer`, a Proxy over an array, so the values are copied out: the
 * lookup context's details key walks the value as a plain array.
 *
 * @internal
 */
function variantsFor(variant: unknown): readonly (string | symbol)[] {
  if (variant == null) return [];
  return Array.isArray(variant) ? [...(variant as readonly string[])] : [String(variant)];
}

/**
 * Rails `ImplicitRender#method_for_action` — Rails returns the string
 * `"default_render"`; trails uses camelCase identifiers per CLAUDE.md
 * so we return `"defaultRender"`, matching the export name on this
 * module.
 *
 * @internal
 */
export function methodForAction(
  this: ImplicitRenderHost & { _superMethodForAction?(name: string): string | undefined },
  actionName: string,
): string | undefined {
  const sup = this._superMethodForAction?.(actionName);
  if (sup) return sup;
  if (this.templateExists?.(String(actionName), this._prefixes?.())) return "defaultRender";
  return undefined;
}

/**
 * Rails `ImplicitRender#interactive_browser_request?` — GET request for
 * HTML content that isn't an XHR.
 *
 * @internal
 */
export function isInteractiveBrowserRequest(this: ImplicitRenderHost): boolean {
  const req = this.request;
  if (!req) return false;
  return req.isGet === true && req.format?.symbol === "html" && req.xhr !== true;
}
