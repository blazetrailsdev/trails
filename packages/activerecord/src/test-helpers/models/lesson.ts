// vendor/rails/activerecord/test/models/lesson.rb
import { Base } from "../../base.js";

export class LessonError extends Error {}

export class Lesson extends Base {
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
