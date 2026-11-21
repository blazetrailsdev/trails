import { ConnectionAdapters } from "../namespaces.js";

import { SQLite3Adapter } from "./sqlite3-adapter.js";

/** @noRailsEquivalent CONVERGEABLE sqlite-adapter-names-select-the-engine-not-subclasses */
export class NodeSQLiteAdapter extends SQLite3Adapter {}

ConnectionAdapters.NodeSQLiteAdapter = NodeSQLiteAdapter;
