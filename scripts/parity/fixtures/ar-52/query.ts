import { weeks } from "@blazetrails/activesupport";
import { Range } from "@blazetrails/activerecord";
import { Order } from "./models.js";

const now = new Date();
const weekAgo = weeks(1).ago(now);
export default Order.where({ created_at: new Range(weekAgo, now) });
