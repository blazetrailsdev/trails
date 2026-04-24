import { Table } from "@blazetrails/arel";
const posts = new Table("posts");
export default posts.get("title").as("name");
