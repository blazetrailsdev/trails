import { Base } from "../../../base.js";

export class CpkCar extends Base {
  static _tableName = "cpk_cars";

  static {
    this.hasMany("carReviews", {
      className: "CpkCarReview",
      foreignKey: ["car_make", "car_model"],
    });
  }
}
