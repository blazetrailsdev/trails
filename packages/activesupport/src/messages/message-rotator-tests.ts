import { expect, it } from "vitest";

import type { MessageSerializer } from "./codec.js";
import type { OnRotation } from "./rotator.js";

export const DATA: readonly unknown[] = [{ a_boolean: true, a_number: 123, a_string: "abc" }];

export interface RotatorCodecHooks<T> {
  secret(key: string): unknown;
  makeCodec(...args: unknown[]): T;
  encode(data: unknown, codec: T, options?: Record<string, unknown>): string;
  decode(message: string, codec: T, options?: Record<string, unknown>): unknown;
}

interface RotatableCodec {
  rotate(...args: unknown[]): RotatableCodec;
  onRotation(callback: OnRotation): RotatableCodec;
}

function rotatable(codec: unknown): RotatableCodec {
  return codec as RotatableCodec;
}

export function assertRotate<T>(
  hooks: RotatorCodecHooks<T>,
  current: unknown[],
  old: unknown[][],
  messageMetadata: Record<string, unknown> = {},
): void {
  const currentCodec = hooks.makeCodec(...current);

  for (const oldArgs of old) {
    rotatable(currentCodec).rotate(...oldArgs);

    const oldCodec = hooks.makeCodec(...oldArgs);
    const oldMessage = hooks.encode(DATA, oldCodec, messageMetadata);

    expect(hooks.decode(oldMessage, currentCodec, messageMetadata)).toEqual(DATA);

    if (Object.keys(messageMetadata).length > 0) {
      expect(hooks.decode(oldMessage, currentCodec)).toBeNull();
    }
  }
}

export function messageRotatorTests<T>(hooks: RotatorCodecHooks<T>): void {
  const { secret, makeCodec, encode, decode } = hooks;

  it("rotate secret", () => {
    assertRotate(hooks, [secret("new")], [[secret("old")], [secret("older")]]);
  });

  it("rotate secret when message has purpose", () => {
    assertRotate(hooks, [secret("new")], [[secret("old")]], { purpose: "purpose" });
  });

  it("rotate url_safe", () => {
    assertRotate(hooks, [{ url_safe: true }], [[{ url_safe: false }]]);
  });

  it("rotate serializer", () => {
    assertRotate(hooks, [{ serializer: "json" }], [[{ serializer: "marshal" }]]);
  });

  it("rotate serializer when message has purpose", () => {
    assertRotate(hooks, [{ serializer: "json" }], [[{ serializer: "marshal" }]], {
      purpose: "purpose",
    });
  });

  it("rotate serializer that raises a custom deserialization error", () => {
    class CustomDeserializationError extends Error {}

    const serializer: MessageSerializer = {
      dump: () => "",
      load: () => {
        throw new CustomDeserializationError();
      },
    };

    assertRotate(hooks, [{ serializer }], [[{ serializer: "json" }], [{ serializer: "marshal" }]]);
  });

  it("rotate secret and options", () => {
    assertRotate(
      hooks,
      [secret("new"), { url_safe: true }],
      [[secret("old"), { url_safe: false }]],
    );
  });

  it("on_rotation is called on successful rotation", () => {
    let called: boolean | null = null;
    assertRotate(
      hooks,
      [
        secret("new"),
        {
          onRotation: () => {
            called = true;
          },
        },
      ],
      [[secret("old")]],
    );
    expect(called).toBe(true);
  });

  it("rotate().on_rotation is called on successful rotation", () => {
    let called: boolean | null = null;
    const codec = makeCodec(secret("new"));
    rotatable(codec)
      .rotate(secret("old"))
      .onRotation(() => {
        called = true;
      });
    const oldCodec = makeCodec(secret("old"));
    const oldMessage = encode(DATA, oldCodec);
    expect(decode(oldMessage, codec)).toEqual(DATA);
    expect(called).toBe(true);
  });

  it("on_rotation is not called when no rotation is necessary", () => {
    let called: boolean | null = null;
    assertRotate(
      hooks,
      [
        secret("same"),
        {
          onRotation: () => {
            called = true;
          },
        },
      ],
      [[secret("same")]],
    );
    expect(called).toBeNull();
  });

  it("on_rotation is not called when no rotation is successful", () => {
    let called: boolean | null = null;
    const codec = makeCodec(secret("new"), {
      onRotation: () => {
        called = true;
      },
    });
    rotatable(codec).rotate(secret("old"));
    const otherMessage = encode(DATA, makeCodec(secret("other")));

    expect(decode(otherMessage, codec)).toBeNull();
    expect(called).toBeNull();
  });

  it("on_rotation method option takes precedence over constructor option", () => {
    let called = "";
    const codec = makeCodec(secret("new"), {
      onRotation: () => {
        called += "via constructor";
      },
    });
    rotatable(codec).rotate(secret("old"));
    const oldMessage = encode(DATA, makeCodec(secret("old")));

    expect(
      decode(oldMessage, codec, {
        onRotation: () => {
          called += "via method";
        },
      }),
    ).toEqual(DATA);
    expect(called).toBe("via method");
  });
}
