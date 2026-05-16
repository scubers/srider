/**
 * UUID generation. We use `crypto.randomUUID()` which is available in
 * service workers, side panels, and options pages from Chrome 92+.
 */
export function uuid(): string {
  return crypto.randomUUID();
}
