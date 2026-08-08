import { Table } from "@blazetrails/arel";
const posts = new Table("posts");
export default posts.get("answers_count").multiply(2);
