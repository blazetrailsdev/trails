import { Customer } from "./models.js";

export default Customer.where({ last_name: "Smith" }).or(
  Customer.where({ orders_count: [1, 3, 5] }),
);
