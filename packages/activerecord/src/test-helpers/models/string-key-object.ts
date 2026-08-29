import { Base } from "../../base.js";

export class StringKeyObject extends Base {
  declare lock_version: number;
  declare name: string;

  static _primaryKey = "id";
}
