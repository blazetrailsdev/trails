/** @internal */
export function columnText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "number") return String(value);
  const [mantissa, exponent] = value.toExponential(14).split("e");
  const exp = Number(exponent);
  if (value !== 0 && Number.isFinite(value) && (exp < -4 || exp >= 15)) {
    const m = String(Number(mantissa));
    const sign = exp < 0 ? "-" : "+";
    return `${m.includes(".") ? m : `${m}.0`}e${sign}${String(Math.abs(exp)).padStart(2, "0")}`;
  }
  const text = String(Number(value.toPrecision(15)));
  return /^-?\d+$/.test(text) ? `${text}.0` : text;
}
