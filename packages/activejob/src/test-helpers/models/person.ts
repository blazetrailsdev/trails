import { Identification } from "@blazetrails/globalid";
import { include, rbModConstSet, registerConstant, StandardError } from "@blazetrails/ruby-compat";

class RecordNotFound extends StandardError {}

export class Person {
  static toString(): string {
    return "Person";
  }

  declare static RecordNotFound: typeof RecordNotFound;

  readonly id: unknown;

  static find(id: unknown): Person {
    if (Number.parseInt(String(id), 10) === 404) {
      throw new RecordNotFound("Cannot find person with ID=404");
    }
    return new this(id);
  }

  constructor(id: unknown) {
    this.id = id;
  }

  equals(otherPerson: unknown): boolean {
    return otherPerson instanceof Person && String(this.id) === String(otherPerson.id);
  }
}
include(Person, Identification);
registerConstant("Person", Person);
rbModConstSet(Person, "RecordNotFound", RecordNotFound);
