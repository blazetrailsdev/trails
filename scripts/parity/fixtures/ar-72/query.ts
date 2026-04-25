import { User } from "./models.js";

export default User.select("id").distinct().where({ active: true });
