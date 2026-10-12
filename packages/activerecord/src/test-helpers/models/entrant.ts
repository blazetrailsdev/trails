import type { Course } from "./course.js";
import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Entrant extends Base {
  declare course_id: number;
  declare name: string;

  static {
    this.belongsTo("course");
  }
}
registerModel(Entrant);
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Entrant {
  get course(): Course | null | Promise<Course | null>;
  set course(value: Course | null);
}
