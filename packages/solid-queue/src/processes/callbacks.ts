import { Callbacks as ActiveModelCallbacks } from "@blazetrails/activemodel";
import { extend, included } from "@blazetrails/activesupport";
import { classModule } from "@blazetrails/ruby-compat";

export class Callbacks {
  static readonly [classModule] = true;

  static [included](base: object): void {
    extend(base, ActiveModelCallbacks);
    (base as typeof ActiveModelCallbacks).defineModelCallbacks("boot", "shutdown");
  }
}

export declare class ClassMethods {
  beforeBoot: (...args: unknown[]) => void;
  aroundBoot: (...args: unknown[]) => void;
  afterBoot: (...args: unknown[]) => void;
  beforeShutdown: (...args: unknown[]) => void;
  aroundShutdown: (...args: unknown[]) => void;
  afterShutdown: (...args: unknown[]) => void;
}
