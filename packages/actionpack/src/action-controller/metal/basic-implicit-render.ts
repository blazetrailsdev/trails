/**
 * ActionController::BasicImplicitRender
 *
 * After dispatching an action, if no render was performed,
 * sends head :no_content.
 * @see https://api.rubyonrails.org/classes/ActionController/BasicImplicitRender.html
 */

export function defaultRender(controller: {
  performed: boolean;
  head(status: number | string): void;
}): void {
  if (!controller.performed) {
    controller.head("no_content");
  }
}

export function sendAction(
  controller: { performed: boolean; head(status: number | string): void },
  method: () => unknown,
): unknown {
  const ret = method();
  defaultRender(controller);
  return ret;
}
