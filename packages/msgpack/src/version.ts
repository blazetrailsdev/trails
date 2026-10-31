import { constSet } from "@blazetrails/ruby-compat";
import { MessagePack } from "./namespaces.js";

export const VERSION = "1.8.0";

constSet(MessagePack, "VERSION", VERSION);
