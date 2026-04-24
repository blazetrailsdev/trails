import { Table, star } from "@blazetrails/arel";
const users = new Table("users");
export default users.project(star);
