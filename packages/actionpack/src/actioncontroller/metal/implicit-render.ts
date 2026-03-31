/**
 * ActionController::ImplicitRender
 *
 * Handles implicit rendering for a controller action that does not
 * explicitly respond with render, respond_to, redirect, or head.
 * @see https://api.rubyonrails.org/classes/ActionController/ImplicitRender.html
 */

import { UnknownFormat, MissingExactTemplate } from "./exceptions.js";

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
