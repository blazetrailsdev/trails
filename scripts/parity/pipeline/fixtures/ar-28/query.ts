import { Customer } from "./models.js";

export default Customer.where({ last_name: "Smith" }).merge(Customer.where({ orders_count: 5 }));
