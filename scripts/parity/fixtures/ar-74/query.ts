import { User } from "./models.js";

export default User.where({ name: ["Alice", null] });
