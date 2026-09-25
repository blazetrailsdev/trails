import { ARUnit2Model } from "./arunit2-model.js";

export class College extends ARUnit2Model {
  declare name: string;
  static {
    this.hasMany("courses");
    this.hasMany(
      "students",
      function (this: any) {
        return this.where({ active: true });
      },
      { dependent: "destroy" },
    );
  }
}
