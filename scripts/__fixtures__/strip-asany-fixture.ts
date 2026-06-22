// Fixture for strip-asany.test.ts. Each line below exercises one scope rule.
// Do not reformat: the test asserts on exact candidate members and output.
declare const thing: unknown;
declare function sink(value: unknown): void;

// Removable: member is a plain (non-underscore) property access.
sink((thing as any).id);
sink((thing as any).name);

// Left alone: underscore reach (private).
sink((thing as any)._privateField);

// Left alone: array cast, not a bare `any`.
sink((thing as any[]).length);

// Left alone: terminal cast with no member access.
sink(thing as any);
