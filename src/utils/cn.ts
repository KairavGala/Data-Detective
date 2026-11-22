/**
 * Composes conditional CSS class strings without extra runtime dependencies.
 */
export function cn(
  ...classes: ReadonlyArray<string | false | null | undefined>
): string {
  return classes.filter(Boolean).join(' ');
}
