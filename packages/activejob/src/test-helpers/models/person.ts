import { Identification } from "@blazetrails/globalid";
import { include, rbInspect, registerConstant, StandardError } from "@blazetrails/ruby-compat";

export class Person {
  declare _id: unknown;

  static toString(): string {
    return "Person";
  }

  get id() {
    return this._id;
  }

  static find(id: unknown) {
    if ((parseInt(String(id), 10) || 0) === 404) {
      throw new RecordNotFound("Cannot find person with ID=404");
    }
    return new this(id);
  }

  constructor(id: unknown) {
    this._id = id;
  }

  equals(otherPerson: unknown) {
    return (
      otherPerson instanceof Person &&
      (Array.isArray(this.id) ? rbInspect(this.id) : String(this.id ?? "")) ===
        (Array.isArray(otherPerson.id) ? rbInspect(otherPerson.id) : String(otherPerson.id ?? ""))
    );
  }
}
registerConstant("Person", Person);
include(Person, Identification);
export class RecordNotFound extends StandardError {
  static toString(): string {
    return "Person::RecordNotFound";
  }
}
registerConstant("Person::RecordNotFound", RecordNotFound);
