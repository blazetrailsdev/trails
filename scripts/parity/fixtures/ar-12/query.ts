import { User } from "./models.js";

export default User.order({ created_at: "desc" }).limit(10).offset(20);
