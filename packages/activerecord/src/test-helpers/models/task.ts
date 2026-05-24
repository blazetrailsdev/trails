// vendor/rails/activerecord/test/models/task.rb
import { Base } from "../../base.js";

export class Task extends Base {
  get updatedAt() {
    return this.readAttribute("ending");
  }
}
