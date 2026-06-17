import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Student } from "./student.js";
// vendor/rails/activerecord/test/models/lesson.rb
import { Base } from "../../base.js";

export class LessonError extends Error {}

export class Lesson extends Base {
  declare students: AssociationProxy<Student>;
  declare name: string;

  static {
    this.hasAndBelongsToMany("students");
    this.beforeDestroy(async function (this: any) {
      return this.ensureNoStudents();
    });
  }

  async ensureNoStudents() {
    if (!(await (this as any).students.isEmpty())) throw new LessonError();
  }
}
