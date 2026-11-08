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
  beforeBoot: (...callbacks: unknown[]) => void;
  aroundBoot: (...callbacks: unknown[]) => void;
  afterBoot: (...callbacks: unknown[]) => void;
  beforeShutdown: (...callbacks: unknown[]) => void;
  aroundShutdown: (...callbacks: unknown[]) => void;
  afterShutdown: (...callbacks: unknown[]) => void;
}
