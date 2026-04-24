import { User } from "./models.js";

export default User.whereNot({ tall: true });
