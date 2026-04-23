import { Table, Nodes, star } from "@blazetrails/arel";
const users = new Table("users");
const comments = new Table("comments");
const usersTop = new Table("users_top");
const topQuery = users.project(users.get("id")).order(users.get("karma").desc()).take(10);
comments
  .project(star)
  .where(comments.get("author_id").in(usersTop.project(usersTop.get("id"))))
  .with(new Nodes.As(usersTop, topQuery));
