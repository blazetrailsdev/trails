import { Metal } from "./metal.js";
import { ApiRendering } from "./api/api-rendering.js";
import {
  RateLimiting,
  type ClassMethods as RateLimitingClassMethods,
} from "./metal/rate-limiting.js";
import { Logging, type logAt } from "./metal/logging.js";
import { include, type Included } from "@blazetrails/activesupport";
import { Caching } from "../abstract-controller/caching.js";
import { ConditionalGet } from "./metal/conditional-get.js";
import { BasicImplicitRender } from "./metal/basic-implicit-render.js";
import { DataStreaming } from "./metal/data-streaming.js";
import { Redirecting } from "./metal/redirecting.js";
import { Renderers } from "./metal/renderers.js";
import { DefaultHeaders } from "./metal/default-headers.js";
import { Callbacks } from "../abstract-controller/callbacks.js";
import {
  Rendering as AbstractControllerRendering,
  type render,
} from "../abstract-controller/rendering.js";
import { UrlFor } from "./metal/url-for.js";
import { Rescue } from "./metal/rescue.js";
import { Instrumentation } from "./metal/instrumentation.js";
import {
  Options as ParamsWrapperOptions,
  ParamsWrapper,
  type _setWrapperOptions,
  type wrapParameters,
} from "./metal/params-wrapper.js";
import { StrongParameters, type Parameters as Params } from "./metal/strong-parameters.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface API
  extends
    Included<typeof UrlFor>,
    Included<typeof Redirecting>,
    Included<typeof ConditionalGet>,
    Included<typeof DataStreaming> {
  render: OmitThisParameter<typeof render>;
  get params(): Params;
  set params(value: Params | Record<string, unknown>);
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class API extends Metal {
  static {
    this.abstractBang();
  }

  static withoutModules<T extends typeof API>(this: T, ..._modules: unknown[]): T {
    return this;
  }

  declare static raiseOnOpenRedirects: boolean;

  declare static rateLimit: OmitThisParameter<(typeof RateLimitingClassMethods)["rateLimit"]>;

  declare static logAt: OmitThisParameter<typeof logAt>;

  declare static _wrapperOptions: ParamsWrapperOptions;
  declare _wrapperOptions: ParamsWrapperOptions;
  /** @internal */
  declare static _setWrapperOptions: OmitThisParameter<typeof _setWrapperOptions>;
  declare static wrapParameters: OmitThisParameter<typeof wrapParameters>;
}

include(API, AbstractControllerRendering);
include(API, UrlFor);
include(API, Redirecting);
include(API, ApiRendering);
include(API, Renderers.All);
include(API, ConditionalGet);
include(API, BasicImplicitRender);
include(API, StrongParameters);
include(API, RateLimiting);
include(API, Caching);
include(API, DataStreaming);
include(API, DefaultHeaders);
include(API, Logging);
include(API, Callbacks);
include(API, Rescue);
include(API, Instrumentation);
include(API, ParamsWrapper);
