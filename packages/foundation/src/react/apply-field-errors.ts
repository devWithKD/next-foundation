"use client";

/**
 * Copies server field errors onto a form. Returns true if any were applied,
 * so the caller toasts the message only when no field took it.
 *
 * `setError` is typed with a `never` name so react-hook-form's own `setError`
 * (whose name parameter is the form's field-path union) is assignable without
 * this package depending on react-hook-form.
 */
export function applyFieldErrors(
  setError: (name: never, error: { type: string; message: string }) => void,
  fieldErrors: Record<string, string[]> | undefined,
): boolean {
  let applied = false;
  for (const [field, messages] of Object.entries(fieldErrors ?? {})) {
    const message = messages[0];
    if (message === undefined) continue;
    setError(field as never, { type: "server", message });
    applied = true;
  }
  return applied;
}
