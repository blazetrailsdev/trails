import { Table, Nodes } from "@blazetrails/arel";
const users = new Table("users");
const win = new Nodes.Window().partition(users.get("name"));
users.get("id").count().over(win);
