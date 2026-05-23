// vendor/rails/activerecord/test/models/college.rb
import { ARUnit2Model } from "./arunit2-model.js";

export class College extends ARUnit2Model {
  static {
    this.hasMany("courses");
    this.hasMany("students", {
      scope: (q: any) => q.where({ active: true }),
      dependent: "destroy",
    });
  }
}
