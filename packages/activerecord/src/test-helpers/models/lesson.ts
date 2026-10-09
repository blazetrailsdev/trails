import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Student } from "./student.js";
import { Exception, registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class LessonError extends Exception {}
registerConstant("LessonError", LessonError);

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
registerConstant("Lesson", Lesson);
