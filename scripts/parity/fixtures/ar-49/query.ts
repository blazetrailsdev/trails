import { Customer } from "./models.js";

export default Customer.where().not({ last_name: null });
