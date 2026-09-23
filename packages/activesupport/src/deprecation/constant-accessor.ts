import { included, prepend } from "@blazetrails/ruby-compat/include";
import { rbConstMissing, rbModConstMissing, rbObjSingletonClass } from "@blazetrails/ruby-compat";
import { ArgumentError } from "../hash-utils.js";
import { callerLocations, type Deprecation } from "../deprecation.js";
import { constantize } from "../inflector.js";

type DeprecatedConstant = { new: string; message: string | null; deprecator: Deprecation };

type DeprecatedConstantAccessorHost = {
  name?: string;
  _deprecatedConstants?: Record<string, DeprecatedConstant>;
};

export const DeprecatedConstantAccessor = {
  [included](base: object): void {
    const extension = {
      constMissing(this: DeprecatedConstantAccessorHost, missingConstName: string): unknown {
        if (this._deprecatedConstants !== undefined) {
          const replacement = this._deprecatedConstants[String(missingConstName)];
          if (replacement) {
            replacement.deprecator.warn(
              replacement.message ??
                `${this.name}::${missingConstName} is deprecated! Use ${replacement.new} instead.`,
              callerLocations(),
            );
            return constantize(String(replacement.new));
          }
        }
        return rbModConstMissing(this, missingConstName);
      },

      deprecateConstant(
        this: DeprecatedConstantAccessorHost,
        oldConstantName: string,
        newConstantPath: string,
        options?: { deprecator: Deprecation; message?: string | null },
      ): void {
        if (options === undefined || !("deprecator" in options)) {
          throw new ArgumentError("missing keyword: :deprecator");
        }
        const { deprecator, message = null } = options;
        if (this._deprecatedConstants === undefined) this._deprecatedConstants = {};
        this._deprecatedConstants[String(oldConstantName)] = {
          new: newConstantPath,
          message,
          deprecator,
        };
      },
    };
    prepend(rbObjSingletonClass(base) as unknown as new () => object, extension);
    rbConstMissing(base);
  },
};
