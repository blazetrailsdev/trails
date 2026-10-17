import { Identification } from "@blazetrails/globalid";
import {
  include,
  toI,
  rbEqual,
  rbObjAsString,
  registerConstant,
  StandardError,
} from "@blazetrails/ruby-compat";

export class Person {
  [key: string]: any;
  static [key: string]: any;

  get id(): any {
    return this._id;
  }

  static find(id: any): any {
    if (rbEqual(toI(id), 404)) {
      throw new RecordNotFound("Cannot find person with ID=404");
    }
    return new this(id);
  }

  constructor(id: any) {
    this._id = id;
  }

  equals(otherPerson: any): any {
    return (
      otherPerson instanceof Person &&
      rbEqual(rbObjAsString(this.id), rbObjAsString(otherPerson.id))
    );
  }
}
registerConstant("Person", Person);
include(Person, Identification);
export class RecordNotFound extends StandardError {
  [key: string]: any;
  static [key: string]: any;
}
registerConstant("Person::RecordNotFound", RecordNotFound);
