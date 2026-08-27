import { Table } from "./index.js";
import { fakeRecordEngine } from "./test-helpers/connection.js";

Table.engine = fakeRecordEngine;
