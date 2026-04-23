import { Table } from "@blazetrails/arel";
const posts = new Table("posts");
posts.get("answers_count").multiply(2);
