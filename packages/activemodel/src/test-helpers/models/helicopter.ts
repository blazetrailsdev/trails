import { rbModConstSet, registerConstant } from "@blazetrails/ruby-compat";
import { Model } from "../../index.js";
import { ModelName } from "../../naming.js";

export class Helicopter extends Model {}
registerConstant("Helicopter", Helicopter);

export class Comanche extends Model {}
rbModConstSet(Helicopter, "Comanche", Comanche);

export class Apache extends Model {
  private static _modelNameMemo: ModelName | null = null;

  static override get modelName(): ModelName {
    if (this._modelNameMemo == null) {
      const modelName = new ModelName(this);
      modelName.collection = "attack_helicopters";
      modelName.element = "ah-64";
      this._modelNameMemo = modelName;
    }
    return this._modelNameMemo;
  }
}
rbModConstSet(Helicopter, "Apache", Apache);
