import { Table } from "@blazetrails/arel";
const posts = new Table("posts");
export default posts.alias("user_posts");
