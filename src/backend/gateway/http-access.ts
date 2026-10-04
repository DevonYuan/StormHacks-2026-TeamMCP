/** Return whether an address identifies the local loopback interface. */
function isLoopbackAddress(address: string): boolean {
  return (
    address === "127.0.0.1" ||
    address.startsWith("127.") ||
    address === "::1" ||
    address.startsWith("::ffff:127.") ||
    address === "localhost"
  );
}

/** Restrict management endpoints to loopback while allowing the public MCP and health paths. */
export function isManagementRequestAllowed(
  localAddress: string,
  path: string,
): boolean {
  if (isLoopbackAddress(localAddress)) return true;
  return path === "/health" || path === "/mcp" || path.startsWith("/mcp/");
}
