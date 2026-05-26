export {
  type TemplateHandler,
  type RenderContext,
  TemplateHandlers,
  TemplateHandlerRegistry,
} from "./template/handlers.js";
export { Raw as RawHandler } from "./template/handlers/raw.js";
export {
  Tse as TseHandler,
  type TseTemplate,
  type TseImplementation,
} from "./template/handlers/tse.js";

// Merged: `Template` is both the interface (data shape) and a namespace
// exposing the Rails-spelled `Template.Error` class.
export { Template } from "./template.js";

export { type TemplateResolver, Resolver } from "./resolver/resolver.js";
export { FileSystemResolver } from "./resolver/file-system-resolver.js";
export { OptimizedFileSystemResolver } from "./resolver/optimized-file-system-resolver.js";
export { InMemoryResolver } from "./resolver/in-memory-resolver.js";

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

export { OutputBuffer, RawOutputBuffer, StreamingBuffer, RawStreamingBuffer } from "./buffers.js";

export { OutputFlow } from "./flows.js";

export { PathSet, type PathSetResolver } from "./path-set.js";
export { TemplatePath } from "./template-path.js";
export {
  TemplateDetails,
  Requested as RequestedDetails,
  type DetailKey,
  type RequestedInit,
} from "./template-details.js";

export * from "./helpers/index.js";

export { Trailtie, type ActionViewConfig } from "./trailtie.js";
export { deprecator, Deprecator } from "./deprecator.js";
export type { TemplateRegistry, TemplateLocals } from "./template-registry.js";

export {
  TseRenderContextImpl,
  type TseRenderContext,
  type RenderOptions,
} from "./render-context.js";
export { type NoExtraKeys, StrictLocalsMismatch } from "./strict-locals.js";
