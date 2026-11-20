import { rbFSend } from "@blazetrails/ruby-compat";

export class RaisesNoMethodError {
  static {
    rbFSend(this, "foobarMethodDoesntExist");
  }
}
