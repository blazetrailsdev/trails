import { include } from "@blazetrails/ruby-compat/include";
import { MethodWrapper } from "./deprecation/method-wrappers.js";
import { Behavior } from "./deprecation/behaviors.js";
import { Reporting } from "./deprecation/reporting.js";
import { Disallowed } from "./deprecation/disallowed.js";
import { ThreadLocalVar } from "./thread-local-var.js";

export {
  DEFAULT_BEHAVIORS,
  DeprecationException,
  type DeprecationBehavior,
  type DeprecationBehaviorCallable,
  type DeprecationBehaviorInput,
} from "./deprecation/behaviors.js";
export { callerLocations, type CallerLocation, type CallSite } from "./deprecation/reporting.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Deprecation {
  static _instance(): Deprecation {
    return (Deprecation.__instance ??= new Deprecation());
  }

  private static __instance?: Deprecation;

  declare static Behavior: typeof Behavior;
  declare static Reporting: typeof Reporting;
  declare static Disallowed: typeof Disallowed;
  declare static MethodWrapper: typeof MethodWrapper;

  deprecationHorizon: string;

  constructor(deprecationHorizon = "8.1", gemName = "Trails") {
    this.gemName = gemName;
    this.deprecationHorizon = deprecationHorizon;
    this._silenceCounter = new ThreadLocalVar(0);
    this.silenced = false;
    this.debug = false;
    this._explicitlyAllowedWarnings = new ThreadLocalVar(null);
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Deprecation extends Behavior, Reporting, Disallowed, MethodWrapper {}

Deprecation.Behavior = Behavior;
Deprecation.Reporting = Reporting;
Deprecation.Disallowed = Disallowed;
Deprecation.MethodWrapper = MethodWrapper;

include(Deprecation, Behavior);
include(Deprecation, Reporting);
include(Deprecation, Disallowed);
include(Deprecation, MethodWrapper);
