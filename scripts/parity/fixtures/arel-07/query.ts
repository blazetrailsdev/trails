import { Table } from "@blazetrails/arel";
const users = new Table("users");
users.get("name").eq(null);
