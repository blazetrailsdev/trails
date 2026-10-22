import { registerConstant } from "@blazetrails/ruby-compat";
import type * as ConfigurationGenerated from "./configuration.js";
import type * as ImageGenerated from "./image.js";
import type * as MiniMagickGenerated from "./mini-magick.js";
import type * as ShellGenerated from "./shell.js";
import type * as ToolGenerated from "./tool.js";
import type * as UtilitiesGenerated from "./utilities.js";
import type * as VersionGenerated from "./version.js";

export type Namespace = { name: string };

export const MiniMagick = { name: "MiniMagick" } as Namespace & {
  Configuration: typeof ConfigurationGenerated.Configuration;
  Image: typeof ImageGenerated.Image;
  isImagemagick7: typeof MiniMagickGenerated.isImagemagick7;
  cliVersion: typeof MiniMagickGenerated.cliVersion;
  Error: typeof MiniMagickGenerated.Error;
  Invalid: typeof MiniMagickGenerated.Invalid;
  TimeoutError: typeof MiniMagickGenerated.TimeoutError;
  _imagemagick7?: boolean;
  Shell: typeof ShellGenerated.Shell;
  Tool: typeof ToolGenerated.Tool;
  Utilities: typeof UtilitiesGenerated.Utilities;
  version: typeof VersionGenerated.version;
  VERSION: typeof VersionGenerated.VERSION;
};
registerConstant("MiniMagick", MiniMagick);
