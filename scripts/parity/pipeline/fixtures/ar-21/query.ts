import { User, Post } from "./models.js";

const posts = Post.arelTable;
export default User.where(
  Post.where(posts.get("user_id").eq(User.arelTable.get("id")))
    .arel()
    .exists()
    .not(),
);
