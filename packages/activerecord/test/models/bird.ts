import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet } from "@blazetrails/ruby-compat/include";
import { kernelThrow } from "@blazetrails/ruby-compat/kernel-catch";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import type { Pirate } from "./pirate.js";
import { Base } from "../../lib/base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Bird extends Base {
  declare color: string;
  declare name: string;
  declare pirate_id: number;

  declare cancelSaveFromCallback: boolean | undefined;
  declare totalCount: number | undefined;
  declare enableCount: boolean | undefined;

  static {
    this.belongsTo("pirate");
    this.validates("name", { presence: true });
    this.acceptsNestedAttributesFor("pirate");

    this.beforeSave(async function (this: Bird) {
      const conn = await this.constructor.leaseConnection();
      await conn.materializeTransactions?.();
    });

    this.beforeSave(
      function (this: Bird) {
        this.cancelSaveCallbackMethod();
      },
      { if: (r: any) => r.cancelSaveFromCallback },
    );

    this.afterInitialize(function (this: Bird) {
      if (this.enableCount) {
        return Bird.count().then((count) => {
          this.totalCount = count;
        });
      }
    });
  }

  cancelSaveCallbackMethod() {
    kernelThrow(":abort");
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Bird {
  get pirate(): Pirate | null | Promise<Pirate | null>;
  set pirate(value: Pirate | null);
}

constSet(TopLevel, "Bird", Bird);
DescendantsTracker.registerSubclass(Base, Bird);
