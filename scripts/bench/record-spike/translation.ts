import type { ValidationError } from "./validations.js";

/**
 * Looks a key up in an application's translations. Answers the finished
 * string, or undefined for a key it does not have. The spike imports no i18n
 * library: an application hands it one of these, and English is built in.
 */
export type Translate = (key: string, options: Record<string, unknown>) => string | undefined;

type Message = string | { one: string; other: string };

const MESSAGES: Readonly<Record<string, Message>> = {
  blank: "can't be blank",
  inclusion: "is not included in the list",
  taken: "has already been taken",
  too_long: {
    one: "is too long (maximum is 1 character)",
    other: "is too long (maximum is %{count} characters)",
  },
  too_short: {
    one: "is too short (minimum is 1 character)",
    other: "is too short (minimum is %{count} characters)",
  },
  wrong_length: {
    one: "is the wrong length (should be 1 character)",
    other: "is the wrong length (should be %{count} characters)",
  },
  not_a_number: "is not a number",
  not_an_integer: "must be an integer",
  greater_than: "must be greater than %{count}",
  greater_than_or_equal_to: "must be greater than or equal to %{count}",
  equal_to: "must be equal to %{count}",
  less_than: "must be less than %{count}",
  less_than_or_equal_to: "must be less than or equal to %{count}",
  other_than: "must be other than %{count}",
};

function interpolate(template: string, values: Record<string, unknown>): string {
  return template.replace(/%\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

export function i18nKey(modelName: string): string {
  return modelName.replace(/([a-z\d])([A-Z])/g, "$1_$2").toLowerCase();
}

export function humanAttributeName(
  modelName: string,
  attribute: string,
  translate: Translate | null,
): string {
  const translated = translate?.(`activerecord.attributes.${i18nKey(modelName)}.${attribute}`, {});
  if (translated !== undefined) return translated;
  const words = attribute.replace(/_id$/, "").replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The message for one error: the application's translation where it has one, else English. */
export function generateMessage(
  modelName: string,
  { attribute, type, options }: ValidationError,
  translate: Translate | null,
): string {
  if (!type.startsWith(":")) return type;
  const name = type.slice(1);
  const model = i18nKey(modelName);
  const values = {
    ...options,
    model: modelName,
    attribute: humanAttributeName(modelName, attribute, translate),
  };
  if (translate !== null) {
    const keys = [
      `activerecord.errors.models.${model}.attributes.${attribute}.${name}`,
      `activerecord.errors.models.${model}.${name}`,
      `activerecord.errors.messages.${name}`,
      `errors.attributes.${attribute}.${name}`,
      `errors.messages.${name}`,
    ];
    for (const key of keys) {
      const translated = translate(key, values);
      if (translated !== undefined) return translated;
    }
  }
  const message = MESSAGES[name];
  if (message === undefined) return name.replaceAll("_", " ");
  const template =
    typeof message === "string" ? message : options.count === 1 ? message.one : message.other;
  return interpolate(template, values);
}

export function fullMessage(
  modelName: string,
  error: ValidationError,
  translate: Translate | null,
): string {
  const message = generateMessage(modelName, error, translate);
  if (error.attribute === "base") return message;
  const attribute = humanAttributeName(modelName, error.attribute, translate);
  const format = translate?.("errors.format", { attribute, message });
  return format ?? `${attribute} ${message}`;
}
