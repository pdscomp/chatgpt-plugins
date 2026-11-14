# Fusion360 Local

Access the Local Fusion360 MCP server running on http://127.0.0.1:27182/mcp via a Local Connector.

Connects Codex desktop to the existing Fusion MCP server at `http://127.0.0.1:27182/mcp` through a local stdio bridge. No HTTPS redirect, certificate, public listener, or tunnel is needed. Requires Node.js 18+ on PATH, Fusion running, and the Fusion MCP add-in enabled.

The tools, schemas, resources, sessions, and results come from the existing server. This package does not recreate Fusion's API or hard-code a tool list. All calls stay on this computer. This is a desktop integration; uploading it does not allow a cloud or mobile client to reach your computer.

The portable connection is in `mcp.json`; `.mcp.json` and `.codex-plugin/plugin.json` support older Codex clients. The bridge preserves HTTP session and protocol headers and handles JSON and SSE responses. It never automatically retries requests that might change the model.

For a manual startup check: `node server/bridge.mjs`. It waits for newline-delimited MCP JSON on stdin; regular use starts it through the plugin host.
