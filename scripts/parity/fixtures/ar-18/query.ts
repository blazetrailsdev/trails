import { User, Comment } from "./models.js";

export default User.whereNot({ id: Comment.select("user_id").distinct() });
