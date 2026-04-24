import { User } from "./models.js";

export default User.where("users.tall IS NOT TRUE");
