import { User } from "./models.js";

export default User.select("users.*, RANK() OVER (ORDER BY comments_count DESC) as rank").joins(
  "LEFT JOIN (SELECT user_id, COUNT(*) as comments_count FROM comments GROUP BY user_id) comments ON comments.user_id = users.id",
);
