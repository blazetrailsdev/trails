import { Base } from "@blazetrails/activerecord";
type Options = Record<string, unknown>;
export class ApplicationRecord extends Base {
  declare static hasOneAttached: (name: string, options?: Options) => void;
  declare static hasRichText: (name: string, options?: Options) => void;
  declare static broadcastsTo: (stream: string, options?: Options) => void;
  static {
    this.primaryAbstractClass();
  }
}
