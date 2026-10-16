import { rbInspect, rbObjRespondTo, rtest } from "@blazetrails/ruby-compat";
import type { Logger } from "@blazetrails/activesupport";
import { Base, LookupContext } from "@blazetrails/actionview";
import { BadRequest } from "../../action-controller/metal/exceptions.js";

export class DebugView extends Base {
  static readonly RESCUES_TEMPLATE_PATHS: readonly string[] = [
    new URL("./templates", import.meta.url).pathname.replace(/\/$/, ""),
  ];

  constructor(assigns: Record<string, unknown>) {
    const paths = DebugView.RESCUES_TEMPLATE_PATHS.slice();
    const lookupContext = new LookupContext(paths);
    super(lookupContext, assigns, null);
  }

  override compiledMethodContainer(): typeof DebugView {
    return this.constructor as typeof DebugView;
  }

  debugParams(params: Record<string, unknown>): string {
    const cleanParams = { ...params };
    delete cleanParams["action"];
    delete cleanParams["controller"];

    if (Object.keys(cleanParams).length === 0) {
      return "None";
    }
    return prettyPrint(cleanParams, 200);
  }

  debugHeaders(headers: Record<string, unknown> | null | undefined): string {
    if (headers && Object.keys(headers).length > 0) {
      return rbInspect(headers).replace(/,/g, ",\n");
    }
    return "None";
  }

  debugHash(object: { toHash?: () => unknown } | Record<string, unknown>): string {
    const hash =
      typeof (object as { toHash?: () => unknown }).toHash === "function"
        ? (object as { toHash: () => unknown }).toHash()
        : object;
    const entries =
      hash instanceof Map
        ? [...(hash as Map<unknown, unknown>)]
        : Object.entries(hash as Record<string, unknown>);
    return entries
      .sort(([a], [b]) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0))
      .map(([k, v]) => {
        let valueInspected: string;
        try {
          valueInspected = rbInspect(v);
        } catch (e) {
          valueInspected = (e as Error).message;
        }
        return `${String(k)}: ${valueInspected}`;
      })
      .join("\n");
  }

  override render(...args: Parameters<Base["render"]>): ReturnType<Base["render"]> {
    const logger = Base.logger as Logger | null;

    if (rtest(logger) && rbObjRespondTo(logger, "silence")) {
      let result!: ReturnType<Base["render"]>;
      logger.silence(undefined, () => {
        result = super.render(...args);
      });
      return result;
    } else {
      return super.render(...args);
    }
  }

  isProtectAgainstForgery(): boolean {
    return false;
  }

  isParamsValid(): unknown {
    try {
      return (this._request as { parameters: unknown }).parameters;
    } catch (e) {
      if (e instanceof BadRequest) return false;
      throw e;
    }
  }
}

/** @internal */
function prettyPrint(value: unknown, width: number): string {
  const single = rbInspect(value);
  if (single.length <= width) return single;
  return JSON.stringify(value, null, 2);
}
