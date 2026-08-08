import { Customer } from "./models.js";

export default Customer.where().not({ orders_count: [1, 3, 5] });
