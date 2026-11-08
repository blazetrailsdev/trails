import { withIndifferentAccess, type HashWithIndifferentAccess } from "@blazetrails/activesupport";
import { TopLevel, constSet } from "@blazetrails/ruby-compat";

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
constSet(TopLevel, "Parameters", Parameters);
