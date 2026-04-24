import { Customer } from "./models.js";

export default Customer.whereNot({ orders_count: [1, 3, 5] });
