# Tether — Onboarding Guide

> Share MCP servers running on one machine with the rest of your team — securely, over Tailscale, without redeploying anything to the cloud.

This guide walks **two people** through a first connection end-to-end:

| Role | What they do |
| --- | --- |
| **Host** | Runs the local MCP server(s), registers them in Tether, and exposes them to the tailnet. |
| **Client** | Connects to the host's exposed gateway and uses the shared MCP capabilities through their coding agent (e.g. GitHub Copilot in VS Code). |

By the end, the client can type a prompt in Copilot and have it invoke a tool that runs on the **host's** computer.

---

## Prerequisites

Both people need:

- The **Tether** app installed.
- A **Tailscale** account, with their device joined to the same **tailnet**.
- A working internet connection (Tailscale handles the private networking).

The **client** additionally needs:

- **VS Code** with the **GitHub Copilot** extension (Agent mode available).
- **Node.js / `npx`** if they will bridge a stdio-only client (see [Appendix B](#appendix-b--stdio-only-clients)).

---

## Part 1 — Set up Tailscale

Tether does not manage networking itself — it rides on top of Tailscale. Both devices must be on the same tailnet before anything else works.

### 1.1 Host

1. Create a **Tailscale** account (e.g. sign in with Google/GitHub/email).
2. Download and install the **Tailscale** app on the host machine.
3. Open Tailscale and **log in**. This registers the host device on **your** tailnet.
4. In the [Tailscale admin console](https://login.tailscale.com/admin/users), go to **Users** and **Invite** the client (enter their email).

### 1.2 Client

1. Open the **invitation email** and accept it. Create or sign in to your **Tailscale** account.
2. Download and install the **Tailscale** app.
3. Open the Tailscale app and **log in**.
4. In a terminal, run:

   ```bash
   tailscale login
   ```

   You will be redirected to your **browser** to authenticate. Once you finish, your device is added to the tailnet.
5. Verify you are connected and note your tailnet IP:

   ```bash
   tailscale status
   tailscale ip -4
   ```

### 1.3 Confirm the client can reach the host

Before touching MCP, prove the network path works. Run this **on the client** (replace the IP with the host's tailnet IP):

```bash
tailscale ping <host-tailnet-ip>
```

A successful ping means you can proceed. (You'll confirm the gateway itself in [Part 4](#part-4--verify-the-connection).)

---

## Part 2 — Host: add and expose an MCP server

### 2.1 Add the MCP server in Tether

1. Open the **Tether** app.
2. Go to **Settings**.
3. Under **Add server**, fill in:
   - **Server name** — a label, e.g. `files`.
   - **Transport** — choose one:
     - **Local command (stdio)** — Tether launches the server for you. Provide the **Command** and its **Arguments** (one per line).
     - **Remote URL (HTTP)** — Tether connects to an already-running server. Provide its **URL**.
4. Click **Add server**.

Example — the official filesystem MCP server, scoped to a shared folder:

| Field | Value |
| --- | --- |
| Server name | `files` |
| Transport | Local command (stdio) |
| Command | `npx` |
| Arguments (one per line) | `-y`<br>`@modelcontextprotocol/server-filesystem`<br>`/Users/you/shared` |

> **Tip:** point the server at a dedicated folder (e.g. `~/shared`), not your whole home directory.

### 2.2 Expose the gateway

1. Open the **Open a connection** dialog.
2. Click **Expose** (labelled **Expose to tailnet** when the gateway is only running locally).
3. Wait for the status to read **Exposed to your tailnet**.

### 2.3 Capture what to share

Once exposed, the dialog shows **two** values. Send **both** to the client:

| Field | Example | Purpose |
| --- | --- | --- |
| **Address teammates connect to** | `100.100.1.1:8788` | The client enters this in *their* Tether app (Part 3). |
| **MCP endpoint** | `http://100.100.1.1:8788/mcp` | The client adds this to their coding agent (Part 4). |

> Keep the host machine awake and Tether running for the duration of the session.

---

## Part 3 — Client: connect in Tether

1. Open the **Tether** app.
2. Open the **Connect to a teammate** dialog.
3. Enter the **Address** the host gave you (e.g. `100.100.1.1:8788`).
4. Click **Test** to confirm reachability — you should see `Reachable — N tool(s) available`.
5. Click **Connect**. The host's gateway now appears under **Connected peers**.

This registers the host's exposed gateway so its MCP tools are available to you.

---

## Part 4 — Client: add the MCP server to VS Code Copilot

Your coding agent is an MCP client. Point it at the **MCP endpoint** the host shared.

1. In your project, create/edit `.vscode/mcp.json`:

   ```json
   {
     "servers": {
       "tether": {
         "type": "http",
         "url": "http://100.100.1.1:8788/mcp"
       }
     }
   }
   ```

   > Replace the URL with the host's **MCP endpoint**. Use `"servers"` (not `mcpServers`) and `"type": "http"` — this is VS Code's schema for a remote MCP server.

2. Open the Command Palette and run **`MCP: List Servers`**. Find `tether` and click **Start**.

3. In the **Copilot Chat** view, switch to **Agent** mode (tools only work in Agent mode).

4. Click the **tools** (<kbd>🔧</kbd>) icon and confirm the `tether` tools are listed and enabled.

5. Prompt it, e.g.:

   > **Using the tether tools, list the files in the allowed directory, then read and summarize the first one.**

6. **Approve** the tool call when Copilot asks.

The request travels: Copilot → Tether (host) → the MCP server on the host's machine → back. Watch the host's **Activity** page to see it logged in real time.

---

## Part 4b — Verify the connection

You can confirm the capabilities exist from the client at any time.

**Quick liveness check** (works from the client):

```bash
curl -s http://<host-tailnet-ip>:8788/health
```

A `{"status":"ok", ...}` response means the gateway is reachable.

> ⚠️ **Do not** test with `curl http://<host>:8788/mcp`. That endpoint speaks the MCP protocol and requires a POST `initialize` handshake, so a bare request returns `400 "missing session"`. That is expected — not an error. Use `/health` for connectivity and the agent (or Appendix A) to list tools.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `curl` to `/health` times out | Host not exposed, or Tailscale down | Confirm the host's dialog reads **Exposed to your tailnet**; run `tailscale status` on both devices. |
| `tailscale ping` works, `/health` does not | Firewall/tailnet ACL blocking port `8788` | Allow the gateway port in your Tailscale ACLs / host firewall. |
| Tether shows *"Running locally only"* | Gateway bound to loopback only | Click **Expose to tailnet**. |
| `team-mcp`/`tether` server errors in VS Code | Wrong URL or transport | Check **Output → MCP**; ensure `"type": "http"` and the exact `/mcp` URL. |
| Tools list is empty | No upstream server connected on the host | On the host, re-check **Settings** and the server's status. |
| Copilot says no such tool | Chat is in **Ask/Edit** mode | Switch to **Agent** mode and enable the tools. |
| Tool call returns "Access denied" | Client identity not permitted by policy | On the host, review **Settings → Policy** rules. |

---

## Appendix A — List capabilities with curl (no dependencies)

Run **on the client** to enumerate every tool the gateway exposes. Replace the URL with the host's MCP endpoint.

```bash
URL=http://100.100.1.1:8788/mcp

# 1) initialize -> capture the session id from the response headers
SID=$(curl -s -D - -o /dev/null -X POST "$URL" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1.0"}}}' \
  | tr -d '\r' | awk -F': ' 'tolower($1)=="mcp-session-id"{print $2}')
echo "session: $SID"

# 2) notify initialized
curl -s -X POST "$URL" -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' -H "Mcp-Session-Id: $SID" \
  -d '{"jsonrpc":"2.0","method":"notifications/initialized"}' >/dev/null

# 3) list tools (names only)
curl -s -X POST "$URL" -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' -H "Mcp-Session-Id: $SID" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | grep '^data:' | sed 's/^data: //' \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); [print(" -", t["name"]) for t in d["result"]["tools"]]'
```

> Windows: use `curl.exe` (the `curl` in PowerShell is an alias for `Invoke-WebRequest`) and `python` instead of `python3`.
>
> Tool names are **namespaced** with the upstream server's id, e.g. `<server-id>__read_text_file`. That prefix is normal.

## Appendix B — stdio-only clients

Some agents can only spawn a local command and cannot connect to a URL. Bridge them with `mcp-remote`, which runs locally as a stdio server and forwards to the host's HTTP gateway:

```json
{
  "mcpServers": {
    "tether": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://100.100.1.1:8788/mcp"]
    }
  }
}
```

> Rule of thumb: if the agent's config accepts a `url`, use Part 4. If it only accepts `command`/`args`, use this appendix.

---

## Quick reference

```text
HOST                                    CLIENT
────                                    ──────
1. Tailscale + tailnet                  1. Accept invite, tailnet via `tailscale login`
2. Tether → Settings → Add server       2. Tether → Connect to a teammate (Address)
3. Open a connection → Expose           3. VS Code → .vscode/mcp.json (MCP endpoint)
4. Share Address + MCP endpoint   ───▶  4. MCP: List Servers → Start → Copilot (Agent)
```
