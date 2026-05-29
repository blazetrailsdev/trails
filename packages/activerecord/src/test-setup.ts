// The global Arel `toSql` visitor is now installed by `establishConnection`
// (see connection-handling.ts#installAdapterVisitor) and by the `Base.adapter`
// setter. It is intentionally NOT reset between tests: doing so wiped the
// dialect visitor out from under the per-worker handler connection, which is
// why handler-suite files previously needed a `beforeEach` resync. Tests that
// install a one-off dialect visitor for their duration restore it themselves
// (see node.test.ts's try/finally pattern).
export {};
