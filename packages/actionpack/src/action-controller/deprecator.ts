import { Deprecation } from "@blazetrails/activesupport";
import { deprecator as abstractDeprecator } from "../abstract-controller/deprecator.js";
import { Renderers, type RendererProc } from "./metal/renderers.js";

export { Deprecation as Deprecator };

export function deprecator(): Deprecation {
  return abstractDeprecator();
}

export function addRenderer(key: string, block: RendererProc): void {
  Renderers.add(key, block);
}

export function removeRenderer(key: string): void {
  Renderers.remove(key);
}
