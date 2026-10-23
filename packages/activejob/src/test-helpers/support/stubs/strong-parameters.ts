import { withIndifferentAccess } from "@blazetrails/activesupport";
import { registerConstant } from "@blazetrails/ruby-compat";
import type { HashWithIndifferentAccess } from "@blazetrails/activesupport";

export class Parameters {
  declare _parameters: HashWithIndifferentAccess<unknown>;

  static toString(): string {
    return "Parameters";
  }

  constructor(parameters: { a: number } = {}) {
    this._parameters = withIndifferentAccess(parameters);
  }

  isPermitted() {
    return true;
  }

  toH(): Record<string, unknown> {
    return this._parameters.toH();
  }
}
registerConstant("Parameters", Parameters);
