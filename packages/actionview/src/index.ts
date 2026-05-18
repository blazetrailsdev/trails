export {
  type TemplateHandler,
  type RenderContext,
  TemplateHandlerRegistry,
} from "./template-handler.js";

// Merged: `Template` is both the interface (data shape) and a namespace
// exposing the Rails-spelled `Template.Error` class.
export { Template } from "./template.js";

export {
  type TemplateResolver,
  FileSystemResolver,
  InMemoryResolver,
} from "./template-resolver.js";

export { LookupContext, MissingTemplate, DetailsKey } from "./lookup-context.js";

export { TemplateError } from "./template/error.js";
export type { TemplateErrorOptions } from "./template/error.js";

export { PathRegistry } from "./path-registry.js";

export { Digestor } from "./digestor.js";
export type { DigestorOptions } from "./digestor.js";

export { Base } from "./base.js";

export type {
  Rendering,
  Layouts,
  LayoutsClass,
  ViewPaths,
  ViewPathsClass,
  RenderOptions as RenderingOptions,
} from "./rendering.js";

export {
  Renderer,
  type RendererDefaults,
  type RenderOptions as RendererOptions,
} from "./renderer.js";

export { EjsHandler } from "./ejs-handler.js";

export * from "./helpers/index.js";
