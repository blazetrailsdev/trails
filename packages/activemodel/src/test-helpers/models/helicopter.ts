import { Model } from "../../index.js";
import { ModelName } from "../../naming.js";

export class Helicopter extends Model {}

export class Comanche extends Model {
  static override get modelName(): ModelName {
    return new ModelName("Helicopter::Comanche");
  }
}

export class Apache extends Model {
  private static _modelNameMemo: ModelName | null = null;

  static override get modelName(): ModelName {
    if (this._modelNameMemo == null) {
      const modelName = new ModelName("Helicopter::Apache");
      modelName.collection = "attack_helicopters";
      modelName.element = "ah-64";
      this._modelNameMemo = modelName;
    }
    return this._modelNameMemo;
  }
}
