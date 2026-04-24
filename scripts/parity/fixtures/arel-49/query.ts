import { Table, star, sql } from "@blazetrails/arel";
const users = new Table("users");
export default users.project(star).order(users.get("age"), sql("ARRAY_AGG(DISTINCT users.name)"));
