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

export class Collector extends DispatchCollector {}

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
