import { DescendantsTracker } from "@blazetrails/activesupport";
import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Student } from "./student.js";
import { Exception, constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class LessonError extends Exception {}
constSet(TopLevel, "LessonError", LessonError);

export class Lesson extends Base {
  declare students: AssociationProxy<Student>;
  declare name: string;

  static {
    this.hasAndBelongsToMany("students");
    this.beforeDestroy(async function (this: Lesson) {
      return this.ensureNoStudents();
    });
  }

  async ensureNoStudents() {
    if (!(await this.students.isEmpty())) throw new LessonError();
  }
}
constSet(TopLevel, "Lesson", Lesson);
DescendantsTracker.registerSubclass(Base, Lesson);
