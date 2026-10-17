import { withIndifferentAccess } from "@blazetrails/activesupport";
import { toH, registerConstant } from "@blazetrails/ruby-compat";

export class Parameters {
  [key: string]: any;
  static [key: string]: any;

  constructor(parameters: any = {}) {
    this._parameters = withIndifferentAccess(parameters);
  }

  isPermitted(): any {
    return true;
  }

  toH(): any {
    return toH(this._parameters);
  }
}
registerConstant("Parameters", Parameters);
