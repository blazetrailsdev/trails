// vendor/rails/activerecord/test/cases/callbacks_test.rb (ContextualCallbacksDeveloper)
import { Base } from "../../base.js";

/**
 * Rails `ContextualCallbacksDeveloper < ActiveRecord::Base` from
 * callbacks_test.rb: rides the `developers` table and records a per-instance
 * callback `history`, asserting validation-context-aware ordering.
 */
export class ContextualCallbacksDeveloper extends Base {
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
