# Fusion360 Data

Access the Fusion360 Data MCP Server via OAuth login.

This plugin connects directly to:

```text
https://developer.api.autodesk.com/fusion/mcp
```

Use the plugin host's Connect action to sign in to Autodesk. Access to the hosted service depends on your Autodesk account and service eligibility. Authentication discovery was verified against Autodesk's public metadata; an authenticated tool call has not been verified for this repository export.

The configuration uses Streamable HTTP, OAuth client metadata discovery, and the advertised `mcp:read`, `mcp:write`, and `offline_access` scopes. It does not request OpenID Connect. No credentials are included. Do not paste tokens into the manifest or commit them to this repository.

This service's tools are discovered after connecting. The four tools exposed by the separate local Fusion MCP server must not be assumed to exist on the hosted Data server.

## Source notes

The source is the active installed **Fusion360 Data** app-backed plugin version 1.0.0, retrieved on November 14, 2026. Its description, display name, category, and declared capabilities were taken from that export. The author and developer name were subsequently updated to Paul Swenson to match Fusion360 Local. Both plugins link to this GitHub repository. The active export contains a private app binding and a compatibility manifest; it does not contain a portable MCP configuration or icon file.

For this public, portable copy:

- The account-specific app binding is replaced with `mcp.json` for the Autodesk endpoint requested by the owner. OAuth settings come from the endpoint's protected-resource and authorization-server metadata.
- The generated private package name is normalized to `fusion360-data`.
- The listing subtitle is shortened to meet the portable package's 30-character limit. The full active description is retained.
- The owner's supplied 64 × 64 Autodesk PNG is included as the icon.
- A root Agent Plugins manifest and matching compatibility files are included.

This exports the integration definition, not Autodesk's server implementation, account authorization, or user data. The private installed plugin has not been modified by this repository upload.

References: [Autodesk protected-resource metadata](https://developer.api.autodesk.com/.well-known/oauth-protected-resource/fusion/mcp), [Autodesk authorization-server metadata](https://developer.api.autodesk.com/.well-known/oauth-authorization-server/mcpauth).
