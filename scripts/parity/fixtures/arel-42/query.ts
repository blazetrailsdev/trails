import { Table, Nodes } from "@blazetrails/arel";
const posts = new Table("posts");
const comments = new Table("comments");
const postComments = comments.alias("post_comments");
export default posts
  .join(postComments, Nodes.OuterJoin)
  .on(posts.get("id").eq(postComments.get("post_id")));
