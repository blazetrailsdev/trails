import { User, Comment } from "./models.js";

export default User.where().not({ id: Comment.select("user_id").distinct() });
