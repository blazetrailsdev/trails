import { demodulize, dasherize, underscore } from "@blazetrails/activesupport";
import { setArg0, rbModName } from "@blazetrails/ruby-compat";
import { VERSION } from "../version.js";

export const Procline = {
  procline(this: object, string: string): void {
    setArg0(
      `solid-queue-${dasherize(underscore(demodulize(rbModName(this.constructor)!)))}(${VERSION}): ${string}`,
    );
  },
};
