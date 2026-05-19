/**
 * ActionController deprecator + renderer-registry deprecation shims.
 *
 * Mirrors Rails `actionpack/lib/action_controller/deprecator.rb`:
 *
 *     module ActionController
 *       def self.deprecator
 *         AbstractController.deprecator
 *       end
 *     end
 *
 * and the top-level shims in `actionpack/lib/action_controller/metal/renderers.rb`:
 *
 *     def self.add_renderer(key, &block)
 *       Renderers.add(key, &block)
 *     end
 *     def self.remove_renderer(key)
 *       Renderers.remove(key)
 *     end
 */

import { Deprecation } from "@blazetrails/activesupport";
import { deprecator as abstractDeprecator } from "../abstract-controller/deprecator.js";
import { Renderers, type RendererProc } from "./metal/renderers.js";

export { Deprecation as Deprecator };

/**
 * Lazily-initialized Deprecation instance for the ActionController
 * namespace. Mirrors Rails `ActionController.deprecator`, which delegates
 * to `AbstractController.deprecator`.
 */
export function deprecator(): Deprecation {
  return abstractDeprecator();
}

/** Shim for `ActionController.add_renderer(key, &block)` — delegates to `Renderers.add`. */
export function addRenderer(key: string, block: RendererProc): void {
  Renderers.add(key, block);
}

/** Shim for `ActionController.remove_renderer(key)` — delegates to `Renderers.remove`. */
export function removeRenderer(key: string): void {
  Renderers.remove(key);
}
