import { Table } from "@blazetrails/arel";
const posts = new Table("posts");
posts.get("id").in([2, 3, 4]);
