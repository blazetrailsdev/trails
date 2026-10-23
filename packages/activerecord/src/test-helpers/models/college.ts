import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Student } from "./student.js";
import { ARUnit2Model } from "./arunit2-model.js";
import { registerModel } from "../../associations.js";

export class College extends ARUnit2Model {
  declare name: string;
  declare students: AssociationProxy<Student>;
  static {
    this.hasMany("courses");
    this.hasMany(
      "students",
      function () {
        return this.where({ active: true });
      },
      { dependent: "destroy" },
    );
  }
}
registerModel(College);
