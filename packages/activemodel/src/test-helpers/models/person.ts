import { extend } from "@blazetrails/activesupport";
import { Model } from "../../index.js";
import { Translation, type TranslationClassMethods } from "../../translation.js";
import type { ModelName } from "../../naming.js";

export class Person extends Model {
  declare private _title: string | null | undefined;
  declare private _karma: string | null | undefined;
  declare private _salary: string | null | undefined;
  declare private _gender: string | null | undefined;

  get title(): string | null {
    return this._title ?? null;
  }

  set title(value: string | null) {
    this._title = value;
  }

  get karma(): string | null {
    return this._karma ?? null;
  }

  set karma(value: string | null) {
    this._karma = value;
  }

  get salary(): string | null {
    return this._salary ?? null;
  }

  set salary(value: string | null) {
    this._salary = value;
  }

  get gender(): string | null {
    return this._gender ?? null;
  }

  set gender(value: string | null) {
    this._gender = value;
  }

  conditionIsTrue(): boolean {
    return true;
  }

  conditionIsFalse(): boolean {
    return false;
  }
}

export class Gender {
  /** @noRailsEquivalent PERMANENT */
  static moduleName = "Person";

  declare static humanAttributeName: TranslationClassMethods["humanAttributeName"];

  declare static modelName: ModelName;

  static {
    extend(this, Translation);
  }
}

export class Child extends Person {}
