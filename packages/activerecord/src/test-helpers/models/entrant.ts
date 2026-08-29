import type { Course } from "./course.js";
import { Base } from "../../base.js";

export class Entrant extends Base {
  declare course: Course | null;
  declare loadBelongsTo: (name: "course") => Promise<Course | null>;
  declare course_id: number;
  declare name: string;

  static {
    this.belongsTo("course");
  }
}
