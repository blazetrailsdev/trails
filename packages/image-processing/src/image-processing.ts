import { StandardError } from "@blazetrails/ruby-compat";

export class Error extends StandardError {}

export { Builder } from "./builder.js";
export { Chainable } from "./chainable.js";
export { Pipeline } from "./pipeline.js";
export { Processor } from "./processor.js";
export { ImageProcessing } from "./namespaces.js";
export type { ChainableHost } from "./chainable.js";
