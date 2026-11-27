import { TopLevel } from "@blazetrails/ruby-compat";
import { VERSION } from "./version.js";
import type { Engine } from "./engine.js";
import type { Manifest } from "./manifest.js";
import type { Tasks } from "./tasks/stimulus-tasks.js";

export const Stimulus = {
  VERSION,
} as {
  VERSION: string;
  Engine: typeof Engine;
  Manifest: typeof Manifest;
  Tasks: typeof Tasks;
};

TopLevel.Stimulus = Stimulus;

declare module "@blazetrails/ruby-compat/object" {
  interface TopLevelConstants {
    Stimulus?: typeof Stimulus;
  }
}
