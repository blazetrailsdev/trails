import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { College } from "./college.js";
import type { Lesson } from "./lesson.js";
// vendor/rails/activerecord/test/models/student.rb
import { Base } from "../../base.js";

export class Student extends Base {
  declare lessons: AssociationProxy<Lesson>;
  declare college: College | null;
  declare loadBelongsTo: (name: "college") => Promise<College | null>;
  declare active: boolean;
  declare college_id: number;
  declare name: string;

  static {
    this.hasAndBelongsToMany("lessons");
    this.belongsTo("college");
  }
}
