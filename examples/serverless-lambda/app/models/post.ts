import { ApplicationRecord } from "./application-record.ts";
export class Post extends ApplicationRecord {
  declare title: string;
}
