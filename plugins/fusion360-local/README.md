# Fusion360 Local

Access the Local Fusion360 MCP server running on http://127.0.0.1:27182/mcp via a Local Connector.

Connects Codex desktop to the existing Fusion MCP server at `http://127.0.0.1:27182/mcp` through a local stdio bridge. No HTTPS redirect, certificate, public listener, or tunnel is needed. Requires Node.js 18+ on PATH, Fusion running, and the Fusion MCP add-in enabled.

The tools, schemas, resources, sessions, and results come from the existing server. This package does not recreate Fusion's API or hard-code a tool list. All calls stay on this computer. This is a desktop integration; uploading it does not allow a cloud or mobile client to reach your computer.

The portable connection is in `mcp.json`; `.mcp.json` and `.codex-plugin/plugin.json` support older Codex clients. The bridge preserves HTTP session and protocol headers and handles JSON and SSE responses.

## Reconnection

Version 0.1.4 keeps the bridge running after an interrupted upstream connection. It discards failed sessions, repeats the upstream initialization handshake with bounded retries and backoff, and tries connecting again on a later request if Fusion remains offline. Concurrent requests share the reconnection handshake.

Before forwarding a tool call, the bridge validates its session with `tools/list`. Fusion can answer `ping` for a nonexistent session, so a successful ping alone cannot prove that the session is still usable. An expired session is replaced before the command is sent. Recovery initialization and preflight responses stay internal; the host receives only its own replies and relevant notifications.

Read-only MCP discovery requests may be retried once after recovery. **Tool calls are never automatically replayed.** If Fusion executes a command but the response is lost, the bridge returns an error that says to check the outcome before trying again. The next independent request reconnects as needed. Cancellation messages and server-request replies from an old session are not forwarded into a new session.

The bridge also recognizes a truncated SSE response as a dropped connection and finishes a request when its response arrives, even if the server leaves the SSE socket open.

After upgrading, restart or reload the installed plugin once so the host starts the new bridge process. Recovery works while that process remains alive; if the host itself stops the plugin after a startup failure, start it again through the host. Existing subscriptions and server-side session state are not restored, and a changed protocol version requires a plugin reload. The bridge does not close or restart Fusion or save your documents.

Run the interruption tests from the repository root:

```sh
node --test tests/local-transport.test.mjs
```

For a manual startup check: `node server/bridge.mjs`. It waits for newline-delimited MCP JSON on stdin; regular use starts it through the plugin host.
