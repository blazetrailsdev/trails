import { Base } from "../../../base.js";

export class CpkCarReview extends Base {
  static _tableName = "cpk_car_reviews";

  static {
    this.belongsTo("car", { className: "CpkCar", foreignKey: ["car_make", "car_model"] });
  }
}
