/** Side-effect sink for the `initializer-engine` fixture — each fixture module
 * pushes its own name, so a test can assert load order. */
export const loaded: string[] = [];
