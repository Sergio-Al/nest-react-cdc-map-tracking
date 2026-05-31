import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactElement } from "react";

type ThemeProviderProps = Parameters<typeof NextThemesProvider>[0];

// next-themes 0.3.0 types its provider with a union return type that TS refuses
// as a JSX component; cast it to a plain element-returning component.
const Provider = NextThemesProvider as unknown as (
  props: ThemeProviderProps,
) => ReactElement;

/**
 * App-wide theme provider (next-themes). Adds/removes the `dark` class on <html>.
 * Light is the default; the warm-dark "Mission Control" palette is the dark option.
 */
export function ThemeProvider(props: ThemeProviderProps) {
  return <Provider {...props} />;
}
