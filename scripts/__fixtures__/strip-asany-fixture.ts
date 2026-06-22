// Fixture for strip-asany.test.ts. Each line below exercises one scope rule.
// Do not reformat: the test asserts on exact candidate members and output.
declare const thing: unknown;
declare const a: number;
declare const b: number;
declare function getThing(): unknown;
declare function sink(value: unknown): void;

// Removable: member is a plain (non-underscore) property access. The inner
// expression is a left-hand-side expression, so the parens drop too.
sink((thing as any).id);
sink((getThing() as any).name);

// Removable: the inner expression is itself parenthesized (a left-hand-side
// expression), so the cast's own outer parens drop, leaving `(a + b)`.
sink(((a + b) as any).toFixed);

// Left alone: underscore reach (private).
sink((thing as any)._privateField);

// Left alone: array cast, not a bare `any`.
sink((thing as any[]).length);

// Left alone: terminal cast with no member access.
sink(thing as any);
