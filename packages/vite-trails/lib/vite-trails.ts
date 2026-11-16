import { VERSION } from "./version.js";
import type { Engine } from "./engine.js";
import type { TagHelpers } from "./tag-helpers.js";

export class ViteTrails {
  declare static Engine: typeof Engine;
  declare static TagHelpers: typeof TagHelpers;

  static readonly VERSION = VERSION;
}
