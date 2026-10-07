import { Metal } from "./metal.js";
import { DoubleRenderError, type RenderOptions } from "./base.js";
import { renderForApi } from "./api/api-rendering.js";
import {
  RateLimiting,
  type ClassMethods as RateLimitingClassMethods,
} from "./metal/rate-limiting.js";
import { logAt } from "./metal/logging.js";
import { classAttribute, include, type Included } from "@blazetrails/activesupport";
import { Caching } from "../abstract-controller/caching.js";
import { ConditionalGet } from "./metal/conditional-get.js";
import { BasicImplicitRender } from "./metal/basic-implicit-render.js";
import { DataStreaming } from "./metal/data-streaming.js";
import { Redirecting, redirectTo } from "./metal/redirecting.js";
import { UrlFor } from "./metal/url-for.js";
import { Rescue } from "./metal/rescue.js";
import { Instrumentation } from "./metal/instrumentation.js";
import {
  Options as ParamsWrapperOptions,
  ParamsWrapper,
  _setWrapperOptions,
  deferInherited,
  inheritedParamsWrapper,
  wrapParameters,
} from "./metal/params-wrapper.js";
import { StrongParameters, type Parameters as Params } from "./metal/strong-parameters.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface API
  extends Included<typeof UrlFor>, Included<typeof ConditionalGet>, Included<typeof DataStreaming> {
  redirectTo: OmitThisParameter<typeof redirectTo>;
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

  declare static rateLimit: OmitThisParameter<(typeof RateLimitingClassMethods)["rateLimit"]>;

  static logAt = logAt;

  declare static _wrapperOptions: ParamsWrapperOptions;
  /** @noRailsEquivalent CONVERGEABLE api-params-wrapper-is-inlined-into-api-process-action */
  declare static is_wrapperOptions: boolean;
  declare _wrapperOptions: ParamsWrapperOptions;

  static {
    classAttribute.call(this, "_wrapperOptions", {
      default: ParamsWrapperOptions.fromHash({ format: [] }),
    });
    deferInherited.call(this);
  }

  static _setWrapperOptions = _setWrapperOptions;

  /** @noRailsEquivalent CONVERGEABLE api-params-wrapper-is-inlined-into-api-process-action */
  static wrapParameters = wrapParameters;

  /** @internal */
  static inheritedParamsWrapper = inheritedParamsWrapper;

  render(options: RenderOptions = {}): void {
    if (this.performed) {
      throw new DoubleRenderError();
    }

    if (options.status !== undefined && options.status !== null) {
      this.status = options.status;
    }

    const result = renderForApi(options as Record<string, unknown>);
    this.contentType = result.contentType;
    this.responseBody = result.body;
  }
}

include(API, UrlFor);
include(API, Redirecting);
API.prototype.redirectTo = redirectTo;
include(API, ConditionalGet);
include(API, BasicImplicitRender);
include(API, StrongParameters);
include(API, RateLimiting);
include(API, Caching);
include(API, DataStreaming);
include(API, Rescue);
include(API, Instrumentation);
include(API, ParamsWrapper);
