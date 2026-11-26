import { TrendUpIcon } from "@phosphor-icons/react/ssr";

/**
 * The brand mark: an upward trend line, drawn to sit inside the circular
 * badges used by the header logo and the Saga pack emblem. Strokes use
 * currentColor so each badge keeps its own ink colour.
 */
export function TrendMark() {
  return <TrendUpIcon focusable="false" />;
}
