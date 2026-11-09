import { Template } from "../template.js";
import * as Sources from "./sources.js";

export { File } from "./sources/file.js";

declare module "../template.js" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Template {
    let Sources: typeof import("./sources.js");
  }
}

Template.Sources = Sources;
