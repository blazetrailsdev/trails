/**
 * ActionController::BasicImplicitRender
 *
 * After dispatching an action, if no render was performed,
 * sends head :no_content (204).
 * @see https://api.rubyonrails.org/classes/ActionController/BasicImplicitRender.html
 */

export function defaultRender(controller: {
  performed: boolean;
  head(status: number): void;
}): void {
  if (!controller.performed) {
    controller.head(204);
  }
}

export function sendAction(
  controller: { performed: boolean; head(status: number): void },
  method: () => unknown,
): unknown {
  const ret = method();
  defaultRender(controller);
  return ret;
}
