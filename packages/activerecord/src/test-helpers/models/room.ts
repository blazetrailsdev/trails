// vendor/rails/activerecord/test/models/room.rb
import { Base } from "../../base.js";

export class Room extends Base {
  static {
    this.belongsTo("user");
    this.belongsTo("owner", { className: "User" });

    this.belongsTo("landlord", {
      className: "User",
      dependent: "destroy",
      inverseOf: "letRoom",
    });
    this.belongsTo("tenant", {
      className: "User",
      dependent: "destroy",
      inverseOf: "rentedRoom",
    });
  }
}
