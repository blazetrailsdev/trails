import { File, TopLevel, rbModConstDefined } from "@blazetrails/ruby-compat";
import { camelize, parameterize, underscore } from "@blazetrails/activesupport";
import { GeneratorError } from "./generated-attribute.js";

interface AppNameHost {
  options: { name?: string };
  destinationRoot: string;
  _appName?: string;
  _originalAppName?: string;
  _appConstBase?: string;
  _appConst?: string;
  appName(): string;
  originalAppName(): string;
  appConstBase(): string;
  appConst(): string;
}

export const AppName = {
  RESERVED_NAMES: ["application", "destroy", "plugin", "runner", "test"],

  /** @internal */
  appName(this: AppNameHost): string {
    return (this._appName ??= underscore(
      parameterize(this.originalAppName(), { preserveCase: true }),
    ));
  },

  /** @internal */
  originalAppName(this: AppNameHost): string {
    return (this._originalAppName ??= this.options.name ?? File.basename(this.destinationRoot));
  },

  /** @internal */
  appConstBase(this: AppNameHost): string {
    return (this._appConstBase ??= camelize(
      this.appName().replace(/\W/g, "_").replace(/_+/g, "_"),
    ));
  },

  /** @internal */
  camelized(this: AppNameHost): string {
    return this.appConstBase();
  },

  /** @internal */
  appConst(this: AppNameHost): string {
    return (this._appConst ??= `${this.appConstBase()}::Application`);
  },

  /** @internal */
  isValidConst(this: AppNameHost): void {
    if (/^\d/.test(this.appConst())) {
      throw new GeneratorError(
        `Invalid application name ${this.originalAppName()}. Please give a name which does not start with numbers.`,
      );
    } else if (AppName.RESERVED_NAMES.includes(this.originalAppName())) {
      throw new GeneratorError(
        `Invalid application name ${this.originalAppName()}. Please give a ` +
          `name which does not match one of the reserved trails ` +
          `words: ${AppName.RESERVED_NAMES.join(", ")}`,
      );
    } else if (
      rbModConstDefined(TopLevel, this.appConstBase()) ||
      this.appConstBase() in globalThis
    ) {
      throw new GeneratorError(
        `Invalid application name ${this.originalAppName()}, constant ${this.appConstBase()} is already in use. Please choose another application name.`,
      );
    }
  },
};
