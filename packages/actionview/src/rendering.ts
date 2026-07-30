/**
 * Module-as-host interfaces mixed into ActionController::Base. Defined as
 * TS interfaces (not classes) so AC can declaration-merge them into its
 * own class without inheriting state. Real method bodies land in Phase 4.
 *
 * @internal stub - real impl in Phase 4
 */

import type { LookupContext } from "./lookup-context.js";

export interface RenderOptions {
  template?: string;
  partial?: string;
  action?: string;
  layout?: string | false;
  formats?: string[];
  locals?: Record<string, unknown>;
  status?: number;
  body?: string;
  plain?: string;
  html?: string;
  json?: unknown;
  inline?: string;
  [k: string]: unknown;
}

/** @internal stub - real impl in Phase 4 */
export interface Rendering {
  lookupContext: LookupContext;
  render(options: RenderOptions | string, extra?: RenderOptions): string;
  renderToString(options: RenderOptions | string, extra?: RenderOptions): string;
  renderToBody(options?: RenderOptions): string;
  /** @internal */
  _normalizeArgs(action: unknown, options?: RenderOptions): RenderOptions;
  _normalizeOptions(options: RenderOptions): RenderOptions;
  _normalizeRender(options: RenderOptions): RenderOptions;
}

/**
 * Stub for `ActionView::Layouts` (`action_view/layouts.rb:205`).
 *
 * @noRailsEquivalent CONVERGEABLE (story:
 * port-action-view-layouts-behind-rendering-stubs). Deleted once the module
 * is ported to `actionview/src/layouts.ts`.
 */
export interface Layouts {
  _layoutForRendering(formats: string[]): string | false | undefined;
  _layoutFor(name?: string | symbol): string;
}

/** @internal stub - real impl in Phase 4 */
export interface LayoutsClass {
  layout(
    name: string | symbol | false | null | ((...args: unknown[]) => unknown),
    conditions?: { only?: string | string[]; except?: string | string[] },
  ): void;
}
