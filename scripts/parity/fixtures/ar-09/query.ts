import { User } from "./models.js";

export default User.where().not({ tall: true });
