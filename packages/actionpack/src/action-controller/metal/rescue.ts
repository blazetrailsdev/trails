export type RescueHandler = (error: Error) => void | Promise<void>;

export class RescueRegistry {
  private _handlers: Array<{
    errorClass: new (...args: unknown[]) => Error;
    handler: RescueHandler;
  }> = [];

  rescueFrom(errorClass: new (...args: unknown[]) => Error, handler: RescueHandler): void {
    this._handlers.push({ errorClass, handler });
  }

  findHandler(error: Error): RescueHandler | null {
    for (const { errorClass, handler } of [...this._handlers].reverse()) {
      if (error instanceof errorClass) return handler;
    }
    return null;
  }

  async processWithRescue(fn: () => void | Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (error) {
      if (error instanceof Error) {
        const handler = this.findHandler(error);
        if (handler) {
          await handler(error);
          return;
        }
      }
      throw error;
    }
  }
}

interface RescueHost {
  request: { env: Record<string, unknown> };
  isShowDetailedExceptions(): boolean;
  rescueWithHandler(exception: unknown): Promise<boolean>;
}

export function isShowDetailedExceptions(): boolean {
  return false;
}

/** @internal */
export async function processAction(this: RescueHost, block: () => Promise<void>): Promise<void> {
  try {
    await block();
  } catch (exception) {
    this.request.env["action_dispatch.show_detailed_exceptions"] ||=
      this.isShowDetailedExceptions();
    if (!(await this.rescueWithHandler(exception))) throw exception;
  }
}
