import { registerConstant, rbModConstSet } from "@blazetrails/ruby-compat";
import { ActiveJob as ActiveJobSeat } from "./namespaces.js";

export class ConfiguredJob {
  [key: string]: any;
  static [key: string]: any;

  constructor(jobClass: any, options: any = {}) {
    this._options = options;
    this._jobClass = jobClass;
  }

  async performNow(...args: any[]): Promise<any> {
    return await new this._jobClass(...args).set(this._options).performNow();
  }

  async performLater(...args: any[]): Promise<any> {
    return await new this._jobClass(...args).enqueue(this._options);
  }

  async performAllLater(multiArgs: any): Promise<any> {
    return await this._jobClass.performAllLater(multiArgs, { options: this._options });
  }
}
registerConstant("ActiveJob::ConfiguredJob", ConfiguredJob);
rbModConstSet(ActiveJobSeat, "ConfiguredJob", ConfiguredJob);
