import { User } from "./models.js";

export default User.where({ tall: [false, null] });
