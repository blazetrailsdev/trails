/**
 * ActionController::API
 *
 * JSON-only variant of Base. No template rendering, no cookies/flash.
 * @see https://api.rubyonrails.org/classes/ActionController/API.html
 */

import { Metal } from "./metal.js";
import { DoubleRenderError, type RenderOptions } from "./base.js";
import { renderForApi } from "./api/api-rendering.js";

export class API extends Metal {
  static withoutModules<T extends typeof API>(this: T, ..._modules: unknown[]): T {
    return this;
  }

  render(options: RenderOptions = {}): void {
    if (this.performed) {
      throw new DoubleRenderError();
    }

    if (options.status !== undefined && options.status !== null) {
      this.status = options.status;
    }

    const result = renderForApi(options as Record<string, unknown>);
    this.contentType = result.contentType;
    this.body = result.body;
    this.markPerformed();
  }

  redirectTo(url: string, options: { status?: number | string } = {}): void {
    if (this.performed) {
      throw new DoubleRenderError();
    }

    const status = options.status ? Metal.resolveStatus(options.status) : 302;
    this.status = status;
    this.setHeader("location", url);
    this.body = "";
    this.markPerformed();
  }
}
