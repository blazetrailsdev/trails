import { Table } from "@blazetrails/arel";
const users = new Table("users");
const posts = new Table("posts");
const comments = new Table("comments");
const sub = posts.join(comments).on(posts.get("id").eq(comments.get("post_id")));
const subAlias = sub.as("sub");
users.join(subAlias).on(posts.get("user_id").eq(users.get("id")));
