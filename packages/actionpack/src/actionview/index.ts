export {
  type TemplateHandler,
  type RenderContext,
  TemplateHandlerRegistry,
} from "./template-handler.js";

export {
  type Template,
} from "./template.js";

export {
  type TemplateResolver,
  FileSystemResolver,
  InMemoryResolver,
} from "./template-resolver.js";

export {
  LookupContext,
  MissingTemplate,
} from "./lookup-context.js";

export {
  Renderer,
  type RendererDefaults,
  type RenderOptions as RendererOptions,
} from "./renderer.js";

export {
  EjsHandler,
} from "./ejs-handler.js";
