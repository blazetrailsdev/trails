import { Table } from "@blazetrails/arel";
const posts = new Table("posts");
const comments = new Table("comments");
export default posts.join(comments).on(posts.get("id").eq(comments.get("post_id")));
