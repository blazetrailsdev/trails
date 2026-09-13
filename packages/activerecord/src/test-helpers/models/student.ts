import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { College } from "./college.js";
import type { Lesson } from "./lesson.js";
import { Base } from "../../base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Student extends Base {
  declare lessons: AssociationProxy<Lesson>;
  declare active: boolean;
  declare college_id: number;
  declare name: string;

  static {
    this.hasAndBelongsToMany("lessons");
    this.belongsTo("college");
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Student {
  get college(): College | null | Promise<College | null>;
  set college(value: College | null);
}
