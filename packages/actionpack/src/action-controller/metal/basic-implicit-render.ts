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

export function sendAction(this: BasicImplicitRenderHost, method: () => unknown): unknown {
  const ret = method();
  if (!this.performed) defaultRender.call(this);
  return ret;
}

export function defaultRender(this: BasicImplicitRenderHost): void {
  this.head("no_content");
}
