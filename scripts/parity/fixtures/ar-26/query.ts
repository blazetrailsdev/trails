import { Customer } from "./models.js";

export default Customer.where({ last_name: "Smith" }).rewhere({ last_name: "Jones" });
