import { Table } from "@blazetrails/arel";
const posts = new Table("posts");
posts.project(posts.get("id"), posts.get("title"));
