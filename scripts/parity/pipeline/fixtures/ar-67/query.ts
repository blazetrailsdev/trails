import { User } from "./models.js";

export default User.all()
  .with({ active: User.where({ active: true }), admins: User.where({ role: "admin" }) })
  .from("active");
