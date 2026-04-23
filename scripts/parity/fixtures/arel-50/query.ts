import { Table } from "@blazetrails/arel";
const users = new Table("users");
users.take(10).skip(5);
