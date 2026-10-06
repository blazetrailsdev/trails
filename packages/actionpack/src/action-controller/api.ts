import { Metal } from "./metal.js";
import { statusCode } from "@blazetrails/rack";
import { DoubleRenderError, type RenderOptions } from "./base.js";
import { renderForApi } from "./api/api-rendering.js";
import { rateLimit, rateLimiting } from "./metal/rate-limiting.js";
import { logAt } from "./metal/logging.js";
import { classAttribute, include } from "@blazetrails/activesupport";
import {
  Options as ParamsWrapperOptions,
  _performParameterWrapping,
  _setWrapperOptions,
  _wrapperEnabled,
  inheritedParamsWrapper,
  wrapParameters,
  type ParamsWrapperHost,
} from "./metal/params-wrapper.js";
import { StrongParameters, type Parameters as Params } from "./metal/strong-parameters.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface API {
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

  static rateLimit = rateLimit;

  static logAt = logAt;

  /** @internal */
  async rateLimiting(args: Parameters<typeof rateLimiting>[0]): Promise<void> {
    return rateLimiting.call(this, args);
  }

  declare static _wrapperOptions: ParamsWrapperOptions;
  /** @noRailsEquivalent CONVERGEABLE api-params-wrapper-is-inlined-into-api-process-action */
  declare static is_wrapperOptions: boolean;
  declare _wrapperOptions: ParamsWrapperOptions;

  static {
    classAttribute.call(this, "_wrapperOptions", {
      default: ParamsWrapperOptions.fromHash({ format: [] }),
    });
  }

  static _setWrapperOptions = _setWrapperOptions;

  /** @noRailsEquivalent CONVERGEABLE api-params-wrapper-is-inlined-into-api-process-action */
  static wrapParameters = wrapParameters;

  /** @internal */
  static inheritedParamsWrapper = inheritedParamsWrapper;

  /** @internal */
  async processAction(action: string, ...args: unknown[]): Promise<void> {
    if (_wrapperEnabled.call(this as unknown as ParamsWrapperHost)) {
      _performParameterWrapping.call(this as unknown as ParamsWrapperHost);
    }
    await super.processAction(action, ...args);
  }

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
    this.markPerformed();
  }

  redirectTo(url: string, options: { status?: number | string } = {}): void {
    if (this.performed) {
      throw new DoubleRenderError();
    }

    const status = options.status ? statusCode(options.status) : 302;
    this.status = status;
    this.headers.set("location", url);
    this.responseBody = "";
    this.markPerformed();
  }
}

include(API, StrongParameters);
