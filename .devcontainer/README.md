# Local TypeScript development

Open this repository in the devcontainer. The image pins Node 22.23.2 by digest
and pnpm 10.16.0. TypeScript, generators and test tools come from the lockfile.
The post-create step installs with `--frozen-lockfile --ignore-scripts`.
It does not start databases, download new protocol definitions, or publish.

From `/workspace`:

```sh
make install-dev
make build-all
make test-all
make typecheck
make lint
make format FORMAT_FLAGS=--check
```

Build output is local JavaScript/declarations for testing; npm packaging and
publication are disabled. `make ci` covers proto, client, MCP and all example applications.

Optional PostgreSQL fixture, run explicitly on the host for later live tests:

```sh
docker compose -f .devcontainer/docker-compose.yaml --profile live up -d
```

No Docker socket is mounted into the development container. SQLite and PostgreSQL
are the server storage backends; no Redis service is required.
