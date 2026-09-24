# ChronoQueue TypeScript SDK

> CI, packaging and publishing are disabled. Run validation locally using the
> [development setup](.devcontainer/README.md).

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

A TypeScript SDK for interacting with ChronoQueue, a distributed task scheduling and queue management system.

## 📦 Packages

This is a monorepo containing the following packages:

- **[@chronoqueue/proto](./packages/proto)** – Protocol Buffer definitions and generated TypeScript types
- **[@chronoqueue/client](./packages/client)** – High-level TypeScript/Node.js client SDK for interacting with ChronoQueue (queues, messages, schedules, schemas, and more)
- **[@chronoqueue/mcp-server](./packages/mcp)** – Model Context Protocol (MCP) server for integrating ChronoQueue with AI assistants (28 tools)
- **[Examples](./packages/examples)** – Standalone scripts and full project examples (agent-worker, trip-planner-worker, and more)

## 🚀 Quick Start

### Installation

#### Proto Package

```bash
npm install @chronoqueue/proto
# or
pnpm add @chronoqueue/proto
# or
yarn add @chronoqueue/proto
```

#### Client SDK

```bash
npm install @chronoqueue/client
# or
pnpm add @chronoqueue/client
# or
yarn add @chronoqueue/client
```

#### MCP Server

```bash
npm install @chronoqueue/mcp-server
# or
pnpm add @chronoqueue/mcp-server
```

### Basic Usage

#### Using the Proto Package

```typescript
import { Queue, Message, Payload } from "@chronoqueue/proto";
// Access generated types for queues, messages, schedules, schemas, and more
```

#### Using the Client SDK

```typescript
import {
  ChronoQueueClient,
  ProtoMessage,
  ProtoQueue,
  Message,
} from "@chronoqueue/client";

const client = new ChronoQueueClient({
  connection: { address: "localhost:9000" },
});
await client.connect();

// Create a queue with LeasePolicy and MessageRetentionPolicy
await client.queues.createQueue("checkout-orders", {
  type: ProtoQueue.QueueType.SIMPLE,
  defaultMaxAttempts: 3,
  autoCreateDlq: true,
  leasePolicy: {
    baseLease: { seconds: "300", nanos: 0 },
    maxExtension: { seconds: "1800", nanos: 0 },
    heartbeatTimeout: { seconds: "60", nanos: 0 },
    extendStep: { seconds: "10", nanos: 0 },
    maxRenewals: 5,
  },
  messageRetentionPolicy: {
    mode: ProtoQueue.MessageRetentionPolicy_Mode.RETAIN_DURATION,
    retentionSeconds: "172800", // 2 days
  },
});

// Post a message
await client.messages.postMessage("checkout-orders", {
  messageId: "order-123",
  metadata: {
    payload: {
      data: {
        cartId: "cart-abc123",
        userId: "user-456",
        items: [],
        totalAmount: 999.99,
      },
      contentType: "application/json",
      schemaId: "store-cart.v1",
      schemaVersion: 1,
    },
    priority: "5",
    maxAttempts: 3,
    state: Message.Message_Metadata_State.PENDING,
  },
});

// Post messages in bulk (1–1000 messages, atomic or best-effort)
const bulkResponse = await client.messages.postMessagesBulk(
  "checkout-orders",
  messages, // Array of Message objects
  TransactionMode.ALL_OR_NOTHING, // or BEST_EFFORT for partial success
);
console.log(
  `Posted: ${bulkResponse.successfulCount}/${bulkResponse.totalCount}`,
);

// Get next message with automatic heartbeat
const { message, workerId, attemptId, stopHeartbeat } =
  await client.messages.getNextMessage(
    "checkout-orders",
    undefined, // Use queue's lease policy
    undefined, // No exclusivity key
    true, // Enable automatic heartbeat
    30000, // Heartbeat every 30s
    "worker-1",
  );
if (message) {
  // Process message
  console.log("Processing:", message.metadata?.payload?.data);
  // Acknowledge
  await client.messages.acknowledgeMessage(
    "checkout-orders",
    message.messageId,
    Message.Message_Metadata_State.COMPLETED,
    workerId,
    attemptId,
  );
  stopHeartbeat?.();
}
await client.disconnect();
```

#### Using the MCP Server

The MCP server exposes 28 tools for AI assistants to interact with ChronoQueue:

```bash
# Start the MCP server
CHRONOQUEUE_ADDRESS=localhost:9000 npx chronoqueue-mcp
```

Configure in your AI tool (e.g., Claude Desktop, VS Code, Cursor):

```json
{
  "mcpServers": {
    "chronoqueue": {
      "command": "npx",
      "args": ["-y", "@chronoqueue/mcp-server"],
      "env": {
        "CHRONOQUEUE_ADDRESS": "localhost:9000"
      }
    }
  }
}
```

See [`packages/client/README.md`](./packages/client/README.md) for full SDK usage and [`packages/mcp/README.md`](./packages/mcp/README.md) for MCP configuration.

## 🛠️ Development

### Prerequisites

- Node.js 18 or higher
- pnpm 10 or higher

### Setup

```bash
# Install dependencies
make install-dev

# Download proto definitions
make update-proto

# Generate TypeScript code from protos
make gen-proto

# Build all packages
make build-all
```

### Common Commands

```bash
# Run tests
make test-all

# Run tests for specific packages
make test-proto
make test-client
make test-mcp

# Run tests with coverage
make test-coverage

# Run linting
make lint

# Run type checking
make typecheck

# Run all CI checks
make ci

# Clean build artifacts
make clean
```

For a complete list of available commands, run:

```bash
make help
```

## 📖 Documentation

- **[Local development](.devcontainer/README.md)** - Quick reference for common CI tasks
- **[Bulk Message Posting](./docs/BULK_MESSAGE_POSTING.md)** - Guide to bulk posting with transaction modes
- **[MCP Server](./packages/mcp/README.md)** - MCP server setup, tools reference, and IDE configuration
- **[Testing Setup](./TESTING_SETUP_COMPLETE.md)** - Testing infrastructure documentation
- **[Proto Implementation](./PROTO_PACKAGE_IMPLEMENTATION.md)** - Proto package implementation details
- **[SDK Implementation Plan](./SDK_IMPLEMENTATION_PLAN.md)** - Overall SDK implementation roadmap

## 🏗️ Project Structure

```
chronoqueue-typescript-sdk/
├── packages/
│   ├── proto/              # @chronoqueue/proto – Generated TypeScript types
│   ├── client/             # @chronoqueue/client – SDK client library
│   ├── mcp/               # @chronoqueue/mcp-server – MCP server (28 tools)
│   └── examples/           # Usage examples
│       ├── agent-worker/           # Agent-based task orchestration
│       ├── trip-planner-worker/    # Self-orchestrating trip planner
│       ├── bulk-message-posting.ts # Bulk posting with transaction modes
│       ├── lease-policy-example.ts # LeasePolicy configuration
│       ├── message-retention-policy.ts # Retention policy patterns
│       ├── worker.ts               # Basic worker with heartbeat
│       └── ...                     # More examples
├── proto/                  # Raw .proto files
├── .github/
│   └── workflows/          # CI/CD workflows
├── Makefile                # Build automation
└── package.json            # Workspace root
```

## 🔧 Architecture

### Proto Package

The `@chronoqueue/proto` package contains:

- **Generated TypeScript types** from Protocol Buffer definitions
- **gRPC service definitions** for interacting with ChronoQueue
- **Message encoding/decoding** utilities
- **Type-safe interfaces** for all ChronoQueue entities (queues, messages, schedules, schemas, DLQ, lease policies, retention policies)

### Client Package

The `@chronoqueue/client` package provides:

- High-level client for queue, message, schedule, schema, and DLQ operations
- **Bulk message posting** – post 1–1000 messages in a single call with ALL_OR_NOTHING or BEST_EFFORT transaction modes
- **Automatic heartbeat management** – built-in lease renewal via `getNextMessage` with configurable intervals
- **LeasePolicy support** – configurable base lease, max extension, heartbeat timeout, and renewal limits
- **MessageRetentionPolicy** – retain completed messages for audit trails (duration-based or indefinite)
- Connection management with timeout and retry logic
- Robust error handling with typed error codes
- TypeScript-first API design with full type safety
- Protocol types re-exported for convenience

### MCP Server

The `@chronoqueue/mcp-server` package provides:

- **28 MCP tools** for AI assistants to interact with ChronoQueue
- Queue management, message operations (including bulk posting), scheduling, DLQ, and schema validation
- Configurable via environment variables (`CHRONOQUEUE_ADDRESS`, TLS options)
- Compatible with Claude Desktop, VS Code GitHub Copilot, Cursor, and other MCP-compatible clients
- Full payload visibility with pretty-printed JSON in tool responses

## 🧪 Testing

All packages include comprehensive test suites:

```bash
# Run all tests
make test-all

# Run tests for a specific package
make test-proto
make test-client
make test-mcp

# Run tests with coverage
make test-coverage

# Watch mode
cd packages/proto && pnpm test:watch
cd packages/client && pnpm test:watch
cd packages/mcp && pnpm test:watch
```

Current test coverage (**225 tests total**):

- **Proto package**: 29 tests – generated types and gRPC service definitions
- **Client package**: 156 tests – queues, messages (including bulk posting), schedules, schemas, DLQ, error handling
- **MCP package**: 40 tests – 28 tool definitions, handler logic, payload formatting

## 📋 Releasing

Packaging and publication are disabled. All packages are private and lifecycle
guards reject packaging/publishing. Workflows archived under
`.github/disabled-workflows/` cannot execute. Run validation locally using the
[development setup](.devcontainer/README.md).

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/my-feature`
3. **Make your changes** and add tests
4. **Run CI checks**: `make ci`
5. **Commit your changes**: `git commit -m "feat: add my feature"`
6. **Push to your fork**: `git push origin feature/my-feature`
7. **Open a Pull Request**

### Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `test:` - Test additions or changes
- `chore:` - Maintenance tasks
- `refactor:` - Code refactoring
- `ci:` - CI/CD changes

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Links

- **GitHub**: [adrien19/chronoqueue-typescript-sdk](https://github.com/adrien19/chronoqueue-typescript-sdk)
- **Issues**: [Report a bug or request a feature](https://github.com/adrien19/chronoqueue-typescript-sdk/issues)
- **npm**: [@chronoqueue/proto](https://www.npmjs.com/package/@chronoqueue/proto) · [@chronoqueue/client](https://www.npmjs.com/package/@chronoqueue/client) · [@chronoqueue/mcp-server](https://www.npmjs.com/package/@chronoqueue/mcp-server)

## 💬 Support

For questions and support:

- Open an [issue](https://github.com/adrien19/chronoqueue-typescript-sdk/issues)
- Check the [development setup](.devcontainer/README.md)

## 🗺️ Roadmap

- [x] Proto package with generated TypeScript types
- [x] Comprehensive testing infrastructure (225 tests)
- [x] CI/CD workflows
- [x] Client SDK implementation
- [x] MCP server with 28 tools for AI assistant integration
- [x] Bulk message posting (ALL_OR_NOTHING / BEST_EFFORT)
- [x] LeasePolicy and MessageRetentionPolicy support
- [x] Automatic heartbeat management
- [x] Dead Letter Queue operations
- [x] Examples and tutorials (agent-worker, trip-planner-worker, and standalone scripts)
- [ ] Connection pooling and management
- [ ] Completed message querying within retention window
- [ ] Monitoring and observability hooks
- [ ] Workflow templates (CI/CD, ETL, notifications)

---

**Built with ❤️ by the ChronoQueue Team**
