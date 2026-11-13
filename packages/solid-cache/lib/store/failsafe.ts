import {
  AdapterTimeout,
  ConnectionNotEstablished,
  Deadlocked,
  LockWaitTimeout,
  QueryCanceled,
  StatementTimeout,
} from "@blazetrails/activerecord";
import { ActiveSupport } from "@blazetrails/activesupport";
import { rbInspect } from "@blazetrails/ruby-compat";
import { SolidCache } from "../solid-cache.js";
import type { StoreHost } from "../store.js";

export type ErrorHandler = (args: {
  method: string;
  returning: unknown;
  exception: Error;
}) => unknown;

const TRANSIENT_ACTIVE_RECORD_ERRORS = [
  AdapterTimeout,
  ConnectionNotEstablished,
  Deadlocked,
  LockWaitTimeout,
  QueryCanceled,
  StatementTimeout,
];

const DEFAULT_ERROR_HANDLER: ErrorHandler = ({ method, returning, exception }) => {
  if (SolidCache.Store!.logger) {
    SolidCache.Store!.logger.error?.(
      `SolidCacheStore: ${method} failed, returned ${rbInspect(returning)}: ${exception.name}: ${exception.message}`,
    );
  }
};

export const Failsafe = {
  TRANSIENT_ACTIVE_RECORD_ERRORS,
  DEFAULT_ERROR_HANDLER,

  /** @internal */
  async failsafe<T>(
    this: StoreHost,
    method: string,
    { returning = null }: { returning?: unknown },
    block: () => T | Promise<T>,
  ): Promise<T | unknown> {
    try {
      return await block();
    } catch (error) {
      if (!TRANSIENT_ACTIVE_RECORD_ERRORS.some((klass) => error instanceof klass)) throw error;
      ActiveSupport.errorReporter?.report(error as Error, { handled: true, severity: "warning" });
      this.errorHandler?.({ method: method, exception: error as Error, returning: returning });
      return returning;
    }
  },
};
