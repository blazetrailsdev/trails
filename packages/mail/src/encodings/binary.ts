import { Encodings } from "../encodings.js";
import { Identity } from "./identity.js";

export class Binary extends Identity {
  static override readonly NAME: string = "binary";
  static override readonly PRIORITY: number = 5;
  static {
    Encodings.register(this.NAME, this);
  }
}
