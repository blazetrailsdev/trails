/**
 * ActionController::ImplicitRender
 *
 * Handles implicit rendering for a controller action that does not
 * explicitly respond with render, respond_to, redirect, or head.
 * @see https://api.rubyonrails.org/classes/ActionController/ImplicitRender.html
 */

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

interface ImplicitRenderHost {
  performed: boolean;
  actionName: string;
  controllerName?: string;
  request?: {
    isGet?(): boolean;
    get?: boolean;
    format?: { ref?: string; symbol?: string | null };
    isXhr?(): boolean;
    xhr?: boolean;
    variant?: unknown;
  };
  _prefixes?: string[];
  templateExists?(
    action: string,
    prefixes?: unknown,
    partial?: boolean,
    keys?: readonly string[],
    options?: Record<string, readonly (string | symbol)[]>,
  ): boolean;
  anyTemplates?(action: string, prefixes?: unknown): boolean;
  head(status: number | string): void;
  render(): void;
  logger?: { info(msg: string): void };
}

/**
 * Rails `ImplicitRender#default_render` — picks a template, raises with
 * UnknownFormat / MissingExactTemplate, or falls back to `head :no_content`.
 *
 * @internal
 */
export function defaultRender(this: ImplicitRenderHost): void {
  if (
    this.templateExists?.(String(this.actionName), this._prefixes, false, [], {
      variants: variantsFor(this.request?.variant),
    })
  ) {
    this.render();
    return;
  }
  if (this.anyTemplates?.(String(this.actionName), this._prefixes)) {
    const name = this.controllerName ?? "";
    throw new UnknownFormat(
      `${name}#${this.actionName} is missing a template for this request format and variant.`,
    );
  }
  if (isInteractiveBrowserRequest.call(this)) {
    const name = this.controllerName ?? "";
    throw new MissingExactTemplate(
      `${name}#${this.actionName} is missing a template for request formats.`,
      name,
      this.actionName,
    );
  }
  this.logger?.info(
    `No template found for ${this.controllerName ?? ""}#${this.actionName}, rendering head :no_content`,
  );
  _defaultRender.call(this);
}

/**
 * `request.variant` is an `ActionController::RequestVariant` — an Array
 * subclass — so Rails' `variants: request.variant` kwarg already carries a
 * list (`action_controller/metal/implicit_render.rb:37`).
 *
 * @internal
 */
function variantsFor(variant: unknown): readonly (string | symbol)[] {
  if (variant == null) return [];
  return Array.isArray(variant) ? (variant as readonly string[]) : [String(variant)];
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
  if (this.templateExists?.(String(actionName), this._prefixes)) return "defaultRender";
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
  const isGet = typeof req.isGet === "function" ? req.isGet() : req.get === true;
  const isHtml = req.format?.ref === "html" || req.format?.symbol === "html";
  const isXhr = typeof req.isXhr === "function" ? req.isXhr() : req.xhr === true;
  return Boolean(isGet) && Boolean(isHtml) && !isXhr;
}
