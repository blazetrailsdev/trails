import { TopLevel } from "@blazetrails/ruby-compat";
import { VERSION } from "./version.js";
import type { Config } from "./config.js";
import type { Engine } from "./engine.js";
import type { TagHelpers } from "./tag-helpers.js";

export class ViteTrails {
  declare static Config: typeof Config;
  declare static Engine: typeof Engine;
  declare static TagHelpers: typeof TagHelpers;

  static readonly VERSION = VERSION;
}

TopLevel.ViteTrails = ViteTrails;

declare module "@blazetrails/ruby-compat" {
  interface TopLevelConstants {
    ViteTrails?: typeof ViteTrails;
  }
}
