import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { College } from "./college.js";
import type { Lesson } from "./lesson.js";
import { Base } from "../../base.js";

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
export interface Student {
  get college(): College | null | Promise<College | null>;
  set college(value: College | null);
}
