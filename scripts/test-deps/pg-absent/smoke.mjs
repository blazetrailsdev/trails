const { ConnectionAdapters } = await import("../../../packages/activerecord/dist/index.js");

let resolved;
try {
  await ConnectionAdapters.load("postgresql");
  resolved = { value: ConnectionAdapters.resolve("postgresql").name };
} catch (error) {
  resolved = { error: error.constructor.name, message: error.message };
}

console.log(JSON.stringify({ imported: true, resolved }));
