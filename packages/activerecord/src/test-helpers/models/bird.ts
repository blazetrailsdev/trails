import { throwAbort } from "@blazetrails/activesupport";
import type { Pirate } from "./pirate.js";
// vendor/rails/activerecord/test/models/bird.rb
import { Base } from "../../base.js";
import { acceptsNestedAttributesFor } from "../../nested-attributes.js";

export class Bird extends Base {
  declare pirate: Pirate | null;
  declare loadBelongsTo: (name: "pirate") => Promise<Pirate | null>;
  declare color: string;
  declare name: string;
  declare pirate_id: number;

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
    throwAbort();
  }
}

acceptsNestedAttributesFor(Bird, "pirate");
