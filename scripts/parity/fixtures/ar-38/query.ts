import { User, Comment } from "./models.js";

export default User.where({ id: Comment.select("user_id").where({ approved: true }) });
