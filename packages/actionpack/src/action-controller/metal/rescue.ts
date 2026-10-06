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
