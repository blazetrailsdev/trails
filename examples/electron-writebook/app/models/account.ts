import { include, type Included } from "@blazetrails/activesupport";
import { ApplicationRecord } from "./application-record.ts";
import { Joinable } from "./account/joinable.ts";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface Account extends Included<typeof Joinable> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Account extends ApplicationRecord {
  declare name: string;
  declare join_code: string;
  declare custom_styles: string | null;
  declare embed_providers: Record<string, unknown>[] | null;

  static {
    include(this, Joinable);

    this.serialize("embed_providers", { coder: JSON });
  }
}
