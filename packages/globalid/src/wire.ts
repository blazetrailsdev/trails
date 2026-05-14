// Side-effect module. GID-4 will register the Locator and findGlobalId/
// findSignedGlobalId class methods onto AR Base here via a registration
// callback (e.g. registerGlobalId(Base)) — NOT via a direct import of Base,
// because base.ts already imports this file (static imports are hoisted in
// ESM, so a cross-package circular import would deadlock module initialisation).
