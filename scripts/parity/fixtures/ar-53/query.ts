import { Customer } from "./models.js";

export default Customer.whereNot({ last_name: null }).whereNot({ email: null });
