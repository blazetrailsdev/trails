import { kernelThrow } from "@blazetrails/ruby-compat";
import type { Pirate } from "./pirate.js";
import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

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
      const conn = await (this.constructor as typeof Base).leaseConnection();
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
    kernelThrow(":abort");
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Bird {
  get pirate(): Pirate | null | Promise<Pirate | null>;
  set pirate(value: Pirate | null);
}

registerModel(Bird);
