import i18n from "@/i18n";

type ApiErrorShape = {
  response?: {
    status?: number;
    data?: {
      message?: string;
      errorCode?: string;
    };
  };
  message?: string;
};

/**
 * Translate an axios-style error into a user-facing message.
 *
 * Resolution order:
 *   1. errorCode from the response body → `errors:<code>`
 *   2. server-supplied message
 *   3. caller-provided fallback (already translated by the caller)
 */
export function translateApiError(err: unknown, fallback: string): string {
  const e = err as ApiErrorShape;
  const code = e?.response?.data?.errorCode;
  if (code) {
    const translated = i18n.t(code, { ns: "errors", defaultValue: "" });
    if (translated) return translated;
  }
  const serverMsg = e?.response?.data?.message;
  if (serverMsg) return serverMsg;
  return fallback;
}
