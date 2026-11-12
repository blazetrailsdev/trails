export declare class Thread {
  constructor(fn: () => Promise<void>);
  then(onFulfilled: () => void): void;
  value(): Promise<void>;
  join(): Promise<Thread>;
}
