import { Template } from "../template.js";
import * as Sources from "./sources.js";

export { File } from "./sources/file.js";

declare module "../template.js" {
  namespace Template {
    let Sources: typeof import("./sources.js");
  }
}

Template.Sources = Sources;
