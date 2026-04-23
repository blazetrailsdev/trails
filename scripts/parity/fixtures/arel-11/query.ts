import { Table } from "@blazetrails/arel";
const users = new Table("users");
users.get("age").lteq(10);
