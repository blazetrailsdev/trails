import { Base } from "../../base.js";

export class ContextualCallbacksDeveloper extends Base {
  declare name: string;
  declare salary: number;

  history: string[] = [];

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
}
