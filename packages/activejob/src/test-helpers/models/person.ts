import { Identification } from "@blazetrails/globalid";
import {
  type Included,
  include,
  rbEqual,
  rbModConstSet,
  registerConstant,
  StandardError,
  toI,
  toS,
} from "@blazetrails/ruby-compat";

class RecordNotFound extends StandardError {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Person {
  static toString(): string {
    return "Person";
  }

  declare static RecordNotFound: typeof RecordNotFound;

  readonly id: unknown;

  static find(id: unknown): Person {
    if (rbEqual(toI(id), 404)) {
      throw new RecordNotFound("Cannot find person with ID=404");
    }
    return new this(id);
  }

  constructor(id: unknown) {
    this.id = id;
  }

  equals(otherPerson: unknown): boolean {
    return otherPerson instanceof Person && rbEqual(toS(this.id), toS(otherPerson.id));
  }
}
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface Person extends Included<typeof Identification> {}
include(Person, Identification);
registerConstant("Person", Person);
rbModConstSet(Person, "RecordNotFound", RecordNotFound);
