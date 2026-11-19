import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Base } from "@blazetrails/activerecord";

export class ApplicationRecord extends Base {
  declare static broadcastsTo: (stream: unknown, options?: Record<string, unknown>) => void;
  declare static broadcasts: (stream?: unknown, options?: Record<string, unknown>) => void;
  declare static broadcastsRefreshes: (stream?: unknown) => void;
  declare static suppressingTurboBroadcasts: <T>(block: () => T | Promise<T>) => Promise<T>;

  static {
    this.primaryAbstractClass();
  }
}
constSet(TopLevel, "ApplicationRecord", ApplicationRecord);
