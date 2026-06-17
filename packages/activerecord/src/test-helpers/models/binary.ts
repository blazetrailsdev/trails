// vendor/rails/activerecord/test/models/binary.rb
import { Base } from "../../base.js";

export class Binary extends Base {
  declare blob_data: Uint8Array;
  declare data: Uint8Array;
  declare name: string;
  declare short_data: Uint8Array | null;
}
