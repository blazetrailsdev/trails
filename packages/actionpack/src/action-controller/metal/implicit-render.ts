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

export interface ImplicitRenderHost {
  performed: boolean;
  actionName: string;
  /** Rails reads `self.class.name` for these messages, not `controller_name`. */
  constructor: { name: string };
  request?: {
    /** Rails `request.get?`. */
    isGet?: boolean;
    /** Rails compares `request.format == Mime[:html]`; `symbol` is the
     *  trails spelling, and both `MimeType` and `NullType` answer it. */
    format?: { symbol: string | null };
    /** Rails `request.formats`, reported in both exception messages. */
    formats?: ReadonlyArray<{ toString(): string }>;
    /** Rails `request.variant`, reported in the UnknownFormat message. */
    variant?: unknown;
    /** Rails `request.xhr?`. */
    xhr?: boolean;
  };
  _prefixes?(): string[];
  templateExists?(action: string, prefixes?: string[], opts?: unknown): boolean;
  anyTemplates?(action: string, prefixes?: string[]): boolean;
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
  const name = this.constructor.name;
  const prefixes = this._prefixes?.();
  if (this.templateExists?.(this.actionName, prefixes)) {
    this.render();
    return;
  }
  if (this.anyTemplates?.(this.actionName, prefixes)) {
    throw new UnknownFormat(
      `${name}#${this.actionName} is missing a template ` +
        "for this request format and variant.\n" +
        `\nrequest.formats: ${inspectFormats(this)}` +
        `\nrequest.variant: ${inspectVariant(this)}`,
    );
  }
  if (isInteractiveBrowserRequest.call(this)) {
    throw new MissingExactTemplate(
      `${name}#${this.actionName} is missing a template for request formats: ` +
        `${(this.request?.formats ?? []).map((f) => String(f)).join(",")}`,
      name,
      this.actionName,
    );
  }
  this.logger?.info(`No template found for ${name}#${this.actionName}, rendering head :no_content`);
  this.head(204);
}

/** Rails `request.formats.map(&:to_s).inspect`. @internal */
function inspectFormats(host: ImplicitRenderHost): string {
  return `[${(host.request?.formats ?? []).map((f) => `"${String(f)}"`).join(", ")}]`;
}

/** Rails `request.variant.inspect`. @internal */
function inspectVariant(host: ImplicitRenderHost): string {
  const variant = host.request?.variant;
  if (variant == null) return "nil";
  const list = Array.isArray(variant) ? variant : Array.from(variant as Iterable<unknown>);
  return `[${list.map((v) => `:${String(v)}`).join(", ")}]`;
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
  if (this.templateExists?.(actionName, this._prefixes?.())) return "defaultRender";
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
