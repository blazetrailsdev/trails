import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Base } from "../../lib/base.js";

export class ContextualCallbacksDeveloper extends Base {
  declare name: string;
  declare salary: number;

  declare _history: string[];

  static {
    this.tableName = "developers";
    this.attribute("name", "string");
    this.attribute("salary", "integer");

    this.beforeValidation((r: ContextualCallbacksDeveloper) => {
      r.history.push("before_validation");
    });
    this.beforeValidation(
      (r: ContextualCallbacksDeveloper) => {
        r.history.push(`before_validation_on_${r.validationContext}`);
      },
      { on: ["create", "update"] },
    );

    this.validate((r: ContextualCallbacksDeveloper) => {
      r.history.push("validate");
    });

    this.afterValidation((r: ContextualCallbacksDeveloper) => {
      r.history.push("after_validation");
    });
    this.afterValidation(
      (r: ContextualCallbacksDeveloper) => {
        r.history.push(`after_validation_on_${r.validationContext}`);
      },
      { on: ["create", "update"] },
    );
  }

  get history(): string[] {
    return (this._history ??= []);
  }
}
constSet(TopLevel, "ContextualCallbacksDeveloper", ContextualCallbacksDeveloper);
DescendantsTracker.registerSubclass(Base, ContextualCallbacksDeveloper);
