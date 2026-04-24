import { Customer } from "./models.js";

export default Customer.select("first_name").distinct();
