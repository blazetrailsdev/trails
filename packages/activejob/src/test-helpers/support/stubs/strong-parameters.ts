import { withIndifferentAccess, type HashWithIndifferentAccess } from "@blazetrails/activesupport";
import { registerConstant } from "@blazetrails/ruby-compat";

export class Parameters {
  static toString(): string {
    return "Parameters";
  }

  private _parameters: HashWithIndifferentAccess<unknown>;

  constructor(parameters: Record<string, unknown> = {}) {
    this._parameters = withIndifferentAccess(parameters);
  }

  isPermitted(): boolean {
    return true;
  }

  toH(): Record<string, unknown> {
    return this._parameters.toH() as Record<string, unknown>;
  }
}
registerConstant("Parameters", Parameters);
