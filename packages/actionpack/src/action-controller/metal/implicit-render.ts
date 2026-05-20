/**
 * ActionController::ImplicitRender
 *
 * Handles implicit rendering for a controller action that does not
 * explicitly respond with render, respond_to, redirect, or head.
 * @see https://api.rubyonrails.org/classes/ActionController/ImplicitRender.html
 */

import { UnknownFormat, MissingExactTemplate } from "./exceptions.js";

import { sendAction as _sendAction } from "./basic-implicit-render.js";

/**
 * Rails `BasicImplicitRender#send_action` — re-exposed because
 * `ImplicitRender` includes `BasicImplicitRender`.
 *
 * @internal
 */
export function sendAction(
  controller: { performed: boolean; head(status: number): void },
  method: () => unknown,
): unknown {
  return _sendAction(controller, method);
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
  };
  templateExists?(action: string, prefixes?: unknown, opts?: unknown): boolean;
  anyTemplates?(action: string, prefixes?: unknown): boolean;
  head(status: number): void;
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
  if (this.templateExists?.(this.actionName)) {
    this.render();
    return;
  }
  if (this.anyTemplates?.(this.actionName)) {
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
  this.head(204);
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
  if (this.templateExists?.(actionName)) return "defaultRender";
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

export function implicitRender(context: {
  performed: boolean;
  actionName: string;
  controllerName: string;
  head(status: number): void;
  render(): void;
  templateExists?(action: string): boolean;
  anyTemplates?(action: string): boolean;
  isInteractiveBrowserRequest?(): boolean;
}): void {
  if (context.performed) return;

  if (context.templateExists?.(context.actionName)) {
    context.render();
    return;
  }

  if (context.anyTemplates?.(context.actionName)) {
    throw new UnknownFormat(
      `${context.controllerName}#${context.actionName} is missing a template for this request format and variant.`,
    );
  }

  if (context.isInteractiveBrowserRequest?.()) {
    throw new MissingExactTemplate(
      `${context.controllerName}#${context.actionName} is missing a template for this request format.`,
      context.controllerName,
      context.actionName,
    );
  }

  context.head(204);
}
