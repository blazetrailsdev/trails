// vendor/rails/activerecord/test/migrations/old_and_new_versions/230_add_people_hobby.rb
import { Migration } from "../../../migration.js";

export class AddPeopleHobby extends Migration {
  async up(): Promise<void> {
    await this.addColumn("people", "hobby", "string");
  }

  async down(): Promise<void> {
    await this.removeColumn("people", "hobby");
  }
}

export default new AddPeopleHobby();
