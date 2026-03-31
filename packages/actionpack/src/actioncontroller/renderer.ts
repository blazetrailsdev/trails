/**
 * ActionController::Renderer
 *
 * Renders json, plain text, or HTML outside of controller actions.
 * Returns the rendered body string, matching Rails' Renderer#render.
 * Template/partial rendering requires integration with LookupContext.
 * @see https://api.rubyonrails.org/classes/ActionController/Renderer.html
 */

import { Metal } from "./metal.js";

export class Renderer {
  private _controller: unknown;
  private _defaults: Record<string, unknown>;
  private _lastStatus: number = 200;
  private _lastContentType: string = "text/html; charset=utf-8";

  constructor(controller: unknown, defaults: Record<string, unknown> = {}) {
    this._controller = controller;
    this._defaults = defaults;
  }

  static for(controller: unknown, defaults: Record<string, unknown> = {}): Renderer {
    return new Renderer(controller, defaults);
  }

  /** Derive a new Renderer with updated env (Rails: Renderer#new). */
  new(env: Record<string, unknown> = {}): Renderer {
    return new Renderer(this._controller, { ...this._defaults, ...env });
  }

  render(options: Record<string, unknown> = {}): string {
    const merged = { ...this._defaults, ...options };
    this._lastStatus =
      merged.status !== undefined && merged.status !== null
        ? Metal.resolveStatus(merged.status as number | string)
        : 200;
    const explicitContentType =
      (merged.contentType as string | undefined) ?? (merged.content_type as string | undefined);

    if (merged.json !== undefined) {
      this._lastContentType = explicitContentType ?? "application/json; charset=utf-8";
      return typeof merged.json === "string"
        ? merged.json
        : (JSON.stringify(merged.json) ?? "null");
    }
    if (merged.plain !== undefined) {
      this._lastContentType = explicitContentType ?? "text/plain; charset=utf-8";
      return String(merged.plain);
    }
    if (merged.html !== undefined) {
      this._lastContentType = explicitContentType ?? "text/html; charset=utf-8";
      return String(merged.html);
    }

    this._lastContentType = explicitContentType ?? "text/html; charset=utf-8";
    return "";
  }

  get status(): number {
    return this._lastStatus;
  }

  get contentType(): string {
    return this._lastContentType;
  }

  get defaults(): Record<string, unknown> {
    return { ...this._defaults };
  }

  get controller(): unknown {
    return this._controller;
  }
}
