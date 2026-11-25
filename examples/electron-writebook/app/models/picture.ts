import { include, type Included } from "@blazetrails/activesupport";
import type { One } from "@blazetrails/activestorage";
import { ApplicationRecord } from "./application-record.ts";
import { Leafable } from "./leafable.ts";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Picture extends Included<typeof Leafable>, Leafable {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Picture extends ApplicationRecord {
  declare caption: string | null;
  declare image: One;

  static {
    include(this, Leafable);

    this.hasOneAttached(
      "image",
      undefined,
      (attachable: { variant(n: string, o: object): void }) => {
        attachable.variant("large", { resizeToLimit: [1500, 1500] });
      },
    );
  }

  largeImage(): unknown {
    return this.image.isVariable() ? this.image.variant("large") : this.image;
  }

  async markable(): Promise<string> {
    return this.caption ?? "";
  }
}
