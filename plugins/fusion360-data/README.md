# Fusion360 Data

Access the Fusion360 Data MCP Server via OAuth login.

This plugin connects directly to:

```text
https://developer.api.autodesk.com/fusion/mcp
```

Use the plugin host's Connect action to sign in to Autodesk. Access to the hosted service depends on your Autodesk account and service eligibility. Authentication discovery was verified against Autodesk's public metadata; an authenticated tool call has not been verified for this repository export.

The configuration uses Streamable HTTP, OAuth client metadata discovery, and the advertised `mcp:read`, `mcp:write`, and `offline_access` default scopes. Base scopes are empty, matching the supplied custom-app settings. No credentials are included. Do not paste tokens into the manifest or commit them to this repository.

## OAuth configuration and troubleshooting

The portable and compatibility configurations explicitly select:

| Setting | Value |
| --- | --- |
| Client registration | CIMD |
| Authorization endpoint | `https://developer.api.autodesk.com/mcpauth/v1/authorize` |
| Token endpoint | `https://developer.api.autodesk.com/mcpauth/v1/token` |
| Authorization server | `https://developer.api.autodesk.com/mcpauth` |
| Resource | `https://developer.api.autodesk.com/fusion/mcp` |
| Default scopes | `mcp:read`, `mcp:write`, `offline_access` |
| Base scopes | Empty |
| OIDC enabled | `false` |
| OIDC scopes | Empty |

For ChatGPT's registered custom-app flow, the supplied callback is `https://chatgpt.com/connector_platform_oauth_redirect` and its CIMD client metadata URL is `https://chatgpt.com/oauth/client.json`. The host owns these values. A different desktop MCP host may use its own client identity and callback. Do not add a manually supplied client ID under `client.mode: "cimd"`, hard-code the callback into the authorization endpoint URL, or copy a previous login URL's state or PKCE challenge into the package.

### Autodesk returns `invalid_scope`

In the reported failing request, ChatGPT added `openid` alongside the three MCP scopes. The supplied custom-app screenshots show **OIDC enabled** and a separate general Autodesk OIDC configuration. The MCP authorization server's metadata advertises only the three MCP scopes above. This export disables OIDC and explicitly clears its scope list; it does not copy the general OIDC configuration or userinfo endpoint into the MCP connection.

If you use a separately registered custom app such as **Fusion Data Test**, edit that app's OAuth advanced settings too: turn **OIDC enabled** off, clear OIDC scopes, retain the three default MCP scopes, and retain CIMD and the MCP endpoints above. Changing this repository cannot change a separate custom app's saved authentication settings. A userinfo URL is an endpoint, not an OAuth scope.

After saving the settings, start a fresh Connect flow. Confirm the new authorization request does not request `openid`, `profile`, or `email`. Then confirm tool discovery and run a read-only query such as **List my Fusion projects**. A displayed sign-in page or an installed plugin alone does not establish that OAuth succeeded. A new error after removing `openid` needs separate diagnosis.

For workspace marketplace imports, configure authentication timing in the workspace admin settings; the repository's `ON_INSTALL` policy is not applied by workspace import. See [OpenAI's import documentation](https://learn.chatgpt.com/docs/enterprise/plugin-management#configure-workspace-access).

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
