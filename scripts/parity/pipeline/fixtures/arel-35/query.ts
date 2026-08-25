import { Table, star } from "@blazetrails/arel";
const posts = new Table("posts");
export default posts.project(posts.get(star())).distinct();
