import { ApplicationRecord } from "./application-record.ts";

export class Post extends ApplicationRecord {
  declare title: string;
  declare body: string | null;

  static {
    this.validates("title", { presence: true });
  }
}
