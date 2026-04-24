import { Table } from "@blazetrails/arel";
const comments = new Table("comments");
const replies = comments.alias("replies");
export default comments.join(replies).on(replies.get("parent_id").eq(comments.get("id")));
