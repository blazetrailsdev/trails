import { Table } from "../../lib/index.js";
import { fakeRecordEngine } from "./connection.js";

Table.engine = fakeRecordEngine;
