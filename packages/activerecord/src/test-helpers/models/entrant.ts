import type { Course } from "./course.js";
import { Base } from "../../base.js";

export class Entrant extends Base {
  declare course_id: number;
  declare name: string;

  static {
    this.belongsTo("course");
  }
}
export interface Entrant {
  get course(): Course | null | Promise<Course | null>;
  set course(value: Course | null);
}
