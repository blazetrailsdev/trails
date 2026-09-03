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
