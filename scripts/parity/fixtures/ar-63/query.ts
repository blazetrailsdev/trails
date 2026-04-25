import { Customer } from "./models.js";

export default Customer.where({ orders_count: 1 }).or(
  Customer.where({ orders_count: 3 }).or(Customer.where({ orders_count: 5 })),
);
