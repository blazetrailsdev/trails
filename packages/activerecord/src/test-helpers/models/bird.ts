// vendor/rails/activerecord/test/models/bird.rb
import { Base } from "../../base.js";
import { acceptsNestedAttributesFor } from "../../nested-attributes.js";

export class Bird extends Base {
  cancelSaveFromCallback: boolean = false;
  totalCount: number = 0;
  enableCount: boolean = false;

  static {
    this.belongsTo("pirate");
    this.validates("name", { presence: true });

    this.beforeSave(async function (this: Bird) {
      const conn = (this.constructor as typeof Base).leaseConnection();
      await (conn as any).materializeTransactions?.();
    });

    this.beforeSave(
      function (this: any) {
        this.cancelSaveCallbackMethod();
      },
      { if: (r: any) => r.cancelSaveFromCallback },
    );

    this.afterInitialize(function (this: Bird) {
      if (this.enableCount) {
        void Bird.count().then((c) => {
          this.totalCount = c as number;
        });
      }
    });
  }

  cancelSaveCallbackMethod() {
    throw "abort";
  }
}

acceptsNestedAttributesFor(Bird, "pirate");
