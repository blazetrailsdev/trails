/**
 * ActionController::BasicImplicitRender
 *
 * After dispatching an action, if no render was performed,
 * sends head :no_content.
 * @see https://api.rubyonrails.org/classes/ActionController/BasicImplicitRender.html
 */

interface BasicImplicitRenderHost {
  performed: boolean;
  head(status: number | string): void;
}

export function sendAction(controller: BasicImplicitRenderHost, method: () => unknown): unknown {
  const ret = method();
  if (!controller.performed) defaultRender(controller);
  return ret;
}

export function defaultRender(controller: BasicImplicitRenderHost): void {
  controller.head("no_content");
}
