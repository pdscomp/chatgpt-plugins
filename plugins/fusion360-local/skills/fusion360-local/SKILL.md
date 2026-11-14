---
name: fusion360-local
description: Use to read and work with the user's running local Autodesk Fusion session through its MCP server.
---

Use the fusion360-local MCP tools to inspect projects, documents, API documentation, screenshots, command dialogs, and Electronics data, or execute requested Fusion operations. Discover tools and their schemas from the server; do not invent capabilities.

The bridge connects only to http://127.0.0.1:27182/mcp on this computer. Fusion and its MCP add-in must be running. If disconnected, report the connection error; do not expose the server publicly or retry a modifying operation whose outcome is uncertain.

Read the relevant Fusion API documentation before writing scripts. Verify requested model changes afterward using read operations or a screenshot. Do not catch exceptions inside a script's run function. Save documents only when expressly requested. Ask whether to save or discard before closing a document with unsaved changes.
