import { Order } from "./models.js";

export default Order.group("status").having("SUM(total) > ?", 200);
