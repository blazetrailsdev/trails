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
import {
  Callbacks,
  type ActionCallbackHost,
  type beforeAction,
  type prependBeforeAction,
  type skipBeforeAction,
  type appendBeforeAction,
  type afterAction,
  type prependAfterAction,
  type skipAfterAction,
  type appendAfterAction,
  type aroundAction,
  type prependAroundAction,
  type skipAroundAction,
  type appendAroundAction,
} from "../abstract-controller/callbacks.js";
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

  static MODULES: Array<Parameters<typeof include>[1]> = [
    AbstractControllerRendering,

    UrlFor,
    Redirecting,
    ApiRendering,
    Renderers.All,
    ConditionalGet,
    BasicImplicitRender,
    StrongParameters,
    RateLimiting,
    Caching,

    DataStreaming,
    DefaultHeaders,
    Logging,

    Callbacks,

    Rescue,

    Instrumentation,

    ParamsWrapper,
  ];

  declare static raiseOnOpenRedirects: boolean;

  declare static defineCallbacks: ActionCallbackHost["defineCallbacks"];
  declare static setCallback: ActionCallbackHost["setCallback"];
  declare static skipCallback: ActionCallbackHost["skipCallback"];
  declare static raiseOnMissingCallbackActions: boolean;
  declare static beforeAction: OmitThisParameter<typeof beforeAction>;
  declare static prependBeforeAction: OmitThisParameter<typeof prependBeforeAction>;
  declare static skipBeforeAction: OmitThisParameter<typeof skipBeforeAction>;
  declare static appendBeforeAction: OmitThisParameter<typeof appendBeforeAction>;
  declare static afterAction: OmitThisParameter<typeof afterAction>;
  declare static prependAfterAction: OmitThisParameter<typeof prependAfterAction>;
  declare static skipAfterAction: OmitThisParameter<typeof skipAfterAction>;
  declare static appendAfterAction: OmitThisParameter<typeof appendAfterAction>;
  declare static aroundAction: OmitThisParameter<typeof aroundAction>;
  declare static prependAroundAction: OmitThisParameter<typeof prependAroundAction>;
  declare static skipAroundAction: OmitThisParameter<typeof skipAroundAction>;
  declare static appendAroundAction: OmitThisParameter<typeof appendAroundAction>;

  declare static rateLimit: OmitThisParameter<(typeof RateLimitingClassMethods)["rateLimit"]>;

  declare static logAt: OmitThisParameter<typeof logAt>;

  declare static _wrapperOptions: ParamsWrapperOptions;
  declare _wrapperOptions: ParamsWrapperOptions;
  /** @internal */
  declare static _setWrapperOptions: OmitThisParameter<typeof _setWrapperOptions>;
  declare static wrapParameters: OmitThisParameter<typeof wrapParameters>;
}

for (const mod of API.MODULES) {
  include(API, mod);
}
