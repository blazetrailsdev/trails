import { include, type Included } from "@blazetrails/activesupport";
import { ApplicationRecord } from "./application-record.ts";
import { Leafable } from "./leafable.ts";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Section extends Included<typeof Leafable>, Leafable {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Section extends ApplicationRecord {
  declare body: string | null;
  declare theme: string | null;

  static {
    include(this, Leafable);
  }

  async searchableContent(): Promise<string | null> {
    return this.body;
  }

  async markable(): Promise<string> {
    return this.body ?? "";
  }
}
