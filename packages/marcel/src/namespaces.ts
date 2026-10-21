import { registerConstant } from "@blazetrails/ruby-compat";
import type * as MagicGenerated from "./magic.js";
import type * as MimeTypeGenerated from "./mime-type.js";

export type Namespace = { name: string };

export const Marcel = { name: "Marcel" } as Namespace & {
  Magic: typeof MagicGenerated.Magic;
  MimeType: typeof MimeTypeGenerated.MimeType;
};
registerConstant("Marcel", Marcel);
