import { Table } from "@blazetrails/arel";
const posts = new Table("posts");
posts.get("id").eq(3).and(posts.get("name").eq("hello"));
