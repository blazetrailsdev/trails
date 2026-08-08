import { Table } from "@blazetrails/arel";
const posts = new Table("posts");
export default posts.get("id").in([2, 3, 4]);
