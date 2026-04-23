import { Table } from "@blazetrails/arel";
const users = new Table("users");
users.get("created_at").extract("month");
