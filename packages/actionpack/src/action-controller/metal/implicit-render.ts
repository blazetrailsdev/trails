import { rbInspect as inspect } from "@blazetrails/ruby-compat";

import { UnknownFormat, MissingExactTemplate } from "./exceptions.js";

import {
  defaultRender as _defaultRender,
  sendAction as _sendAction,
} from "./basic-implicit-render.js";

/** @internal */
export function sendAction(
  this: { performed: boolean; head(status: number | string): void },
  method: () => unknown,
): unknown {
  return _sendAction.call(this, method);
}

export interface ImplicitRenderHost {
  performed: boolean;
  actionName: string;
  constructor: { name: string };
  request?: {
    isGet?(): boolean;
    format?: { symbol?: string | null };
    xhr?: boolean;
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
 * @missingRailsArgs inspect — PERMANENT
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

/** @internal */
function variantsFor(variant: unknown): readonly (string | symbol)[] {
  if (variant == null) return [];
  return Array.isArray(variant) ? [...(variant as readonly string[])] : [String(variant)];
}

/** @internal */
export function methodForAction(
  this: ImplicitRenderHost & { _superMethodForAction?(name: string): string | undefined },
  actionName: string,
): string | undefined {
  const sup = this._superMethodForAction?.(actionName);
  if (sup) return sup;
  if (this.templateExists?.(String(actionName), this._prefixes?.())) return "defaultRender";
  return undefined;
}

/** @internal */
export function isInteractiveBrowserRequest(this: ImplicitRenderHost): boolean {
  const req = this.request;
  if (!req) return false;
  return req.isGet?.() === true && req.format?.symbol === ":html" && req.xhr !== true;
}
