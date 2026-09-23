import { extend, type Extended } from "@blazetrails/ruby-compat/include";
import * as Autoload from "./dependencies/autoload.js";
import type { BroadcastLogger } from "./broadcast-logger.js";

type AutoloadModule = Autoload.Autoload & Extended<typeof Autoload>;

const loadPath: Record<string, () => Promise<unknown>> = {
  "active_support/broadcast_logger": () => import("./broadcast-logger.js"),
};

export const ActiveSupport = { name: "ActiveSupport", loadPath } as AutoloadModule & {
  BroadcastLogger: typeof BroadcastLogger;
};
extend(ActiveSupport, Autoload);
ActiveSupport.autoload("BroadcastLogger");
