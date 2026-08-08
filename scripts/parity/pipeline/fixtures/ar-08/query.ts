import { Customer } from "./models.js";

export default Customer.where({ last_name: "Smith" }).where({ orders_count: [1, 3, 5] });
