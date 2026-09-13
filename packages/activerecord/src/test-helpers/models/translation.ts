import type { Attachment } from "./attachment.js";
import { Base } from "../../base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Translation extends Base {
  declare attachment_id: number;
  declare key: string;
  declare locale: string;
  declare value: string;

  static {
    this.belongsTo("attachment", { optional: true });

    this.validates("locale", { presence: true });
    this.validates("key", { presence: true });
    this.validates("value", { presence: true });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Translation {
  get attachment(): Attachment | null | Promise<Attachment | null>;
  set attachment(value: Attachment | null);
}
