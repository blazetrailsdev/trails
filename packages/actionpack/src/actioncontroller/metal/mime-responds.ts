/**
 * ActionController::MimeResponds
 *
 * Content negotiation via respond_to blocks. Exposes an ActionController
 * Collector that wraps ActionDispatch's implementation for API compatibility
 * and future extensions.
 * @see https://api.rubyonrails.org/classes/ActionController/MimeResponds.html
 */

import {
  Collector as DispatchCollector,
  type FormatHandler,
} from "../../actiondispatch/respond-to.js";
import { UnknownFormat } from "./exceptions.js";
export { type FormatHandler };

export class Collector extends DispatchCollector {
  private _anyResponse = false;

  get format(): string | null {
    return this.resolvedFormat;
  }

  override any(handler?: FormatHandler): this {
    this._anyResponse = true;
    return super.any(handler);
  }

  custom(mimeType: string, handler?: FormatHandler): this {
    return this.on(mimeType, handler);
  }

  isAnyResponse(): boolean {
    return this._anyResponse;
  }

  negotiateFormat(request: { accept?: string; format?: string }): string | null {
    const result = this.negotiate({ accept: request.accept, format: request.format });
    return result?.format ?? null;
  }
}

export function respondTo(
  block: (collector: Collector) => void,
  options: { accept?: string; format?: string; variant?: string } = {},
): unknown {
  const collector = new Collector();
  block(collector);

  const result = collector.negotiate(options);
  if (!result) {
    throw new UnknownFormat();
  }

  return result.handler();
}

export class VariantCollector {
  private _variants = new Map<string, () => void>();

  variant(name: string, handler: () => void): void {
    this._variants.set(name, handler);
  }

  get(name: string): (() => void) | undefined {
    return this._variants.get(name);
  }
}
