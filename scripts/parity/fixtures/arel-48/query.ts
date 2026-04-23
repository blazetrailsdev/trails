import { Table } from "@blazetrails/arel";
const users = new Table("users");
users.order(users.get("id").desc());
