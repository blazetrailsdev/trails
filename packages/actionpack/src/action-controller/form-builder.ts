/**
 * ActionController::FormBuilder
 *
 * Configure a custom form builder for controllers. When set,
 * form_with and form_for will use the specified builder class.
 * @see https://api.rubyonrails.org/classes/ActionController/FormBuilder.html
 */

const _registry = new Map<string, unknown>();

export function setDefaultFormBuilder(controllerName: string, builder: unknown): void {
  _registry.set(controllerName, builder);
}

export function getDefaultFormBuilder(controllerName: string): unknown | undefined {
  return _registry.get(controllerName);
}

export function resolveFormBuilder(controllerName: string, fallback?: unknown): unknown {
  return _registry.get(controllerName) ?? fallback;
}
