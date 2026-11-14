# ChatGPT Plug-ins

Two independently packaged Autodesk Fusion integrations maintained in one repository.

| Plugin | Connects to | Requirements |
| --- | --- | --- |
| [Fusion360 Data](plugins/fusion360-data/) | Autodesk's hosted Fusion Data MCP server | Autodesk account and access to the hosted service; OAuth sign-in |
| [Fusion360 Local](plugins/fusion360-local/) | `http://127.0.0.1:27182/mcp` on your computer | Desktop MCP host, Node.js 18+, running Fusion and its MCP add-in |

These are separate integrations. The hosted Data service does not use the local bridge. Local requires Fusion on the same computer as the plugin host.

## Install from this repository

Register the repository as a marketplace in a compatible Codex installation:

```sh
codex plugin marketplace add pdscomp/chatgpt-plugins
```

Open the desktop app's Plugins Directory, select **ChatGPT Plug-ins**, and install the plugin you want. Restart the desktop app if the marketplace is not visible. Follow the host's connection flow for Autodesk OAuth when installing Fusion360 Data. See [OpenAI's plugin packaging and marketplace documentation](https://developers.openai.com/plugins/build/plugins).

Each folder under `plugins/` is self-contained. For a package upload, ZIP the contents of one plugin folder, including hidden compatibility files. Do not upload the whole repository as a single plugin archive. This repository is not a public OpenAI directory submission.

## Source and maintenance

- Fusion360 Data is a portable export based on the active installed app-backed plugin, not the earlier deleted standalone plugin. Read its [source notes](plugins/fusion360-data/README.md#source-notes) for the export differences.
- Fusion360 Local is based on the saved version 0.1.1, with subsequent icon updates in this repository. Its bridge and connection settings are preserved. Public exports omit the account email from author metadata.
- Update each plugin's version independently. Keep its portable and compatibility manifests synchronized. Installing a repository copy does not automatically update an existing account-created plugin, or vice versa.
- Fusion360 Data uses the supplied Autodesk icon; Fusion360 Local uses the supplied Fusion icon. Both PNGs are 64 × 64. Icon display depends on the host; an included image does not guarantee every listing surface displays it.

## Validate changes

Requires Node.js 18+; no package installation is needed:

```sh
node scripts/validate.mjs
node --test tests/local-transport.test.mjs
```

GitHub Actions runs the same package checks and simulated local-connector interruption tests. Live Autodesk OAuth, hosted tools, and the local Fusion session are not exercised by CI. Never commit tokens, passwords, `.env` files, user designs, or session data.

## Ownership and branding

This repository is an independent integration project and is not endorsed by Autodesk or OpenAI. Autodesk Fusion names and logo assets belong to their respective owners. No license grant for those brand assets is implied. No open-source software license has been selected for this repository; public visibility alone does not grant reuse rights.
