import { Handler as RackHandler } from "@blazetrails/rack";
import { Handler } from "../handler.js";

Handler.register("node", RackHandler.Node);
