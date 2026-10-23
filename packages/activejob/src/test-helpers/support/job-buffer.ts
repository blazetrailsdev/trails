import { afterEach } from "vitest";

let _values: unknown[] | undefined;

export const JobBuffer = {
  clear(): void {
    JobBuffer.values().length = 0;
  },

  add(value: unknown): void {
    JobBuffer.values().push(value);
  },

  values(): unknown[] {
    return (_values ??= []);
  },

  lastValue(): unknown {
    return JobBuffer.values().at(-1);
  },
};

afterEach(() => {
  JobBuffer.clear();
});
