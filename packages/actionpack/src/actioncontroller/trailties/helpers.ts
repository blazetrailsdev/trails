/**
 * ActionController::Railties::Helpers
 *
 * Provides helper inclusion via Railtie. When a controller is inherited,
 * automatically includes matching helper modules.
 * @see https://api.rubyonrails.org/classes/ActionController/Railties/Helpers.html
 */

import { underscore } from "@blazetrails/activesupport";

export function resolveHelperPath(controllerName: string): string {
  const base = controllerName.replace(/Controller$/, "");
  return underscore(base) + "_helper";
}

export function inheritedWithHelpers(
  klass: { name: string },
  helperLoader?: (path: string) => unknown,
): void {
  const path = resolveHelperPath(klass.name);
  helperLoader?.(path);
}
