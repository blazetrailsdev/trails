import { Order } from "./models.js";

export default Order.where({ created_at: new Date() });
