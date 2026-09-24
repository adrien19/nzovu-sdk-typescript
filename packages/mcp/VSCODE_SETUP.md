# Editor integration

Build the monorepo with `make build-all`. Configure your editor's MCP client to
launch the local executable:

- Command: `node`
- Argument: absolute path to `packages/mcp/dist/index.js`
- Working directory: repository root
- Environment: `NZOVU_ADDRESS` and, for a plaintext local server,
  `NZOVU_INSECURE=true`

TLS is the default. Configure `NZOVU_CA_PATH` for a private CA and pair
`NZOVU_CERT_PATH` / `NZOVU_KEY_PATH` for mTLS. Supply `NZOVU_API_KEY` through the
editor's secret/environment mechanism, outside committed files.

Use your editor's MCP tool discovery to inspect the 31 registered tools and their
current input schemas. See [configuration and contracts](README.md) for complete
field formats, pagination, ownership and lifecycle behavior.

The server communicates over stdio; stdout must remain reserved for MCP. Build and
connection diagnostics appear on stderr. If startup fails, check the local build,
server address, TLS files and authentication settings.
