import { User } from "./models.js";

export default User.order("created_at").unscope("order").where({ active: true });
