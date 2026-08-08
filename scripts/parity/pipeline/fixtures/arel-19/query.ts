import { Table } from "@blazetrails/arel";
const posts = new Table("posts");
export default posts.get("id").eq(3).and(posts.get("name").eq("hello"));
