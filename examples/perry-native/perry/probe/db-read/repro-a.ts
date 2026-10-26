// Perry: every property on a better-sqlite3 Database/Statement reads
// `undefined`, while method calls work.
//
//   node:  npx tsx repro.ts
//   perry: perry compile repro.ts -o repro && ./repro
//
// Expected (node):  every line matches the comment.
// Actual (perry):   every property line is undefined / [] / false.
import Database from "better-sqlite3";

const db = new Database(":memory:");
const stmt = db.prepare("select 1 as one");

// --- methods: these work in both ---
console.log("stmt.get()          =", JSON.stringify(stmt.get())); // {"one":1}

// --- data properties: undefined in perry, correct in node ---
console.log("stmt.source         =", stmt.source); // "select 1 as one"
console.log("stmt.reader         =", stmt.reader); // true
console.log("stmt.readonly       =", stmt.readonly); // true
console.log("stmt.busy           =", stmt.busy); // false
console.log("db.name             =", db.name); // ":memory:"
console.log("db.open             =", db.open); // true
console.log("db.inTransaction    =", db.inTransaction); // false
console.log("db.memory           =", db.memory); // true

// --- method captured as a value: undefined in perry ---
console.log("typeof stmt.get     =", typeof stmt.get); // "function"

// --- reflection: empty in perry ---
console.log("Object.keys(stmt)   =", JSON.stringify(Object.keys(stmt))); // 5 keys
console.log("'source' in stmt    =", "source" in stmt); // true
console.log("JSON.stringify(stmt)=", JSON.stringify(stmt)); // full object
