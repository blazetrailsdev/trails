import { Table } from "@blazetrails/arel";
const posts = new Table("posts");
posts.project(posts.star).distinct();
