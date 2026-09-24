.PHONY: help install install-dev lock update clean clean-all test lint format gen-proto check-proto setup-dirs update-proto all ci build publish


# Colors for output
GREEN := \033[0;32m
YELLOW := \033[0;33m
RED := \033[0;31m
NC := \033[0m # No Color

# Tools
NPM := npm
PNPM := pnpm
FORMAT_FLAGS ?= --write
NPX := npx
TSC := $(NPX) tsc
ESLINT := $(NPX) eslint
PRETTIER := $(NPX) prettier
JEST := $(NPX) jest
PROTOC := $(NPX) protoc
TSPROTO := $(NPX) protoc-gen-ts_proto
ROOT := $(shell pwd)
PROTO_PATH := proto
PROTO_PKG := packages/proto
PROTO_OUT := $(PROTO_PKG)/src/generated
CLIENT_PKG := packages/client
PACKAGES := packages/proto packages/client
CHRONOQUEUE_REPO ?= adrien19/chronoqueue
CHRONOQUEUE_BRANCH ?= develop
CHRONOQUEUE_PROTO_PATH ?= proto


# Default target
help:
	@echo "$(YELLOW)Chronoqueue TypeScript SDK - Available Targets:$(NC)"
	@echo ""
	@echo "  $(GREEN)make install$(NC)         - Install production dependencies (pnpm ci)"
	@echo "  $(GREEN)make install-dev$(NC)     - Install all dependencies (pnpm install)"
	@echo "  $(GREEN)make update$(NC)          - Update dependencies (pnpm update)"
	@echo "  $(GREEN)make update-proto$(NC)    - Download latest proto definitions from chronoqueue repo"
	@echo "  $(GREEN)make check-proto$(NC)     - Verify proto files exist"
	@echo "  $(GREEN)make gen-proto$(NC)       - Generate TypeScript code from proto files using ts-proto"
	@echo "  $(GREEN)make build-proto$(NC)     - Build proto package"
	@echo "  $(GREEN)make build-client$(NC)    - Build client package"
	@echo "  $(GREEN)make build-mcp$(NC)       - Build MCP server package"
	@echo "  $(GREEN)make build-all$(NC)       - Build all packages"
	@echo "  $(GREEN)make test-proto$(NC)      - Run proto package tests"
	@echo "  $(GREEN)make test-client$(NC)     - Run client package tests"
	@echo "  $(GREEN)make test-mcp$(NC)        - Run MCP server package tests"
	@echo "  $(GREEN)make test-all$(NC)        - Run all package tests"
	@echo "  $(GREEN)make test-coverage$(NC)   - Run tests with coverage report"
	@echo "  $(GREEN)make clean$(NC)           - Remove build artifacts and cache"
	@echo "  $(GREEN)make clean-all$(NC)       - Remove all build artifacts including generated proto code"
	@echo "  $(GREEN)make test$(NC)            - Run unit tests for all packages (alias for test-all)"
	@echo "  $(GREEN)make lint$(NC)            - Run linting checks"
	@echo "  $(GREEN)make format$(NC)          - Format code with Prettier"
	@echo "  $(GREEN)make typecheck$(NC)       - Run TypeScript type checking"
	@echo "  $(GREEN)make ci$(NC)              - Run all CI checks (lint, typecheck, test, build)"
	@echo "  $(GREEN)make all$(NC)             - Install, generate proto, and build all packages"
	@echo ""

# Download proto definitions from chronoqueue repository
update-proto:
	@echo "$(YELLOW)Downloading proto definitions from chronoqueue repository...$(NC)"
	@echo "Fetching proto files from $(CHRONOQUEUE_REPO)/$(CHRONOQUEUE_BRANCH)..."
	@rm -rf /tmp/chronoqueue-proto-download
	@mkdir -p /tmp/chronoqueue-proto-download
	@curl -sL -H "Accept: application/vnd.github.v3+json" \
		"https://api.github.com/repos/$(CHRONOQUEUE_REPO)/tarball/$(CHRONOQUEUE_BRANCH)" \
		-o /tmp/chronoqueue-proto-download/repo.tar.gz
	@tar -xzf /tmp/chronoqueue-proto-download/repo.tar.gz -C /tmp/chronoqueue-proto-download
	@rm -rf $(PROTO_PATH)/*
	@mkdir -p $(PROTO_PATH)
	@cp -r /tmp/chronoqueue-proto-download/*/$(CHRONOQUEUE_PROTO_PATH)/* $(PROTO_PATH)/
	@rm -rf /tmp/chronoqueue-proto-download
	@echo "$(GREEN)Proto definitions updated successfully!$(NC)"
	@find $(PROTO_PATH) -name "*.proto" | wc -l | xargs echo "Downloaded proto files:"
	@echo "Run 'make gen-proto' to regenerate TypeScript classes."

# Check if proto file exists
check-proto:
	@echo "$(YELLOW)Checking for proto files...$(NC)"
	@if [ -z "$$(find $(PROTO_PATH) -name '*.proto' -type f)" ]; then \
		echo "$(RED)Error: No proto files found in $(PROTO_PATH)$(NC)"; \
		echo "Run 'make update-proto' to download proto definitions."; \
		exit 1; \
	fi
	@echo "$(GREEN)Found $$(find $(PROTO_PATH) -name '*.proto' -type f | wc -l) proto file(s)$(NC)"

# Generate TypeScript code from proto files using ts-proto
gen-proto: check-proto
	@echo "$(YELLOW)Generating TypeScript code from proto files using ts-proto...$(NC)"
	@if ! [ -x $(PROTO_PKG)/node_modules/.bin/protoc ]; then \
		echo "$(RED)Error: protoc not found. Run 'pnpm install' first.$(NC)"; \
		exit 1; \
	fi
	@if ! [ -x $(PROTO_PKG)/node_modules/.bin/protoc-gen-ts_proto ]; then \
		echo "$(RED)Error: ts-proto not found. Run 'pnpm install' first.$(NC)"; \
		exit 1; \
	fi
	@rm -rf $(PROTO_OUT)
	@mkdir -p $(PROTO_OUT)
	@cd $(PROTO_PKG) && ./node_modules/.bin/protoc \
		--plugin=protoc-gen-ts_proto=./node_modules/.bin/protoc-gen-ts_proto \
		--ts_proto_out=./src/generated \
		--ts_proto_opt=outputServices=grpc-js,esModuleInterop=true,forceLong=string,useOptionals=messages \
		-I ../.. \
		-I ../../$(PROTO_PATH) \
		$$(find ../../$(PROTO_PATH) -name "*.proto" -type f)
	@echo "$(GREEN)TypeScript code generated successfully in $(PROTO_OUT)!$(NC)"

# Build proto package
build-proto: gen-proto
	@echo "$(YELLOW)Building proto package...$(NC)"
	@cd $(PROTO_PKG) && $(TSC)
	@echo "$(GREEN)Proto package built successfully!$(NC)"

# Build client package (depends on proto)
build-client: build-proto
	@echo "$(YELLOW)Building client package...$(NC)"
	@cd $(CLIENT_PKG) && $(TSC)
	@echo "$(GREEN)Client package built successfully!$(NC)"

# Build mcp package (depends on client, if it exists)
build-mcp: build-client
	@if [ -d "packages/mcp" ]; then \
		echo "$(YELLOW)Building mcp package...$(NC)" && \
		cd packages/mcp && $(TSC) && \
		echo "$(GREEN)mcp package built successfully!$(NC)"; \
	else \
		echo "$(YELLOW)mcp package not found, skipping build$(NC)"; \
	fi

# Build all packages
build-all: build-proto build-client build-mcp
	@echo "$(GREEN)All packages built successfully!$(NC)"

# Test proto package (depends on build-proto for lib files)
test-proto: build-proto
	@echo "$(YELLOW)Testing proto package...$(NC)"
	@cd $(PROTO_PKG) && $(PNPM) test
	@echo "$(GREEN)Proto tests passed!$(NC)"

# Test client package (depends on build-client for lib files)
test-client: build-client
	@echo "$(YELLOW)Testing client package...$(NC)"
	@if [ -f "$(CLIENT_PKG)/package.json" ]; then \
		cd $(CLIENT_PKG) && $(PNPM) test && \
		echo "$(GREEN)Client tests passed!$(NC)"; \
	else \
		echo "$(YELLOW)Client package not yet implemented, skipping tests$(NC)"; \
	fi

# Test mcp package (depends on build-client for lib files)
test-mcp: build-client
	@if [ -d "packages/mcp" ] && [ -f "packages/mcp/package.json" ]; then \
		echo "$(YELLOW)Testing mcp package...$(NC)"; \
		cd packages/mcp && $(PNPM) test && echo "$(GREEN)mcp tests passed!$(NC)"; \
	else \
		echo "$(YELLOW)mcp package not found or no tests defined, skipping tests$(NC)"; \
	fi

# Test all packages
test-all: test-proto test-client test-mcp
	@echo "$(GREEN)All tests passed!$(NC)"

# Test with coverage (requires build-all to ensure dependencies are built)
test-coverage: build-all
	@echo "$(YELLOW)Running tests with coverage...$(NC)"
	@cd $(PROTO_PKG) && $(PNPM) run test:coverage
	@if [ -f "$(CLIENT_PKG)/package.json" ] && grep -q '"test:coverage"' "$(CLIENT_PKG)/package.json"; then \
		cd $(CLIENT_PKG) && $(PNPM) run test:coverage || exit 1; \
	else \
		echo "$(YELLOW)Client package not yet implemented, skipping coverage$(NC)"; \
	fi
	@if [ -d "packages/mcp" ] && grep -q '"test:coverage"' "packages/mcp/package.json" 2>/dev/null; then \
		cd packages/mcp && $(PNPM) run test:coverage || exit 1; \
	else \
		echo "$(YELLOW)MCP package not found or no coverage script, skipping$(NC)"; \
	fi
	@echo "$(GREEN)Coverage reports generated!$(NC)"


# Install production dependencies
install:
	@echo "$(YELLOW)Installing production dependencies...$(NC)"
	@$(PNPM) install --prod --frozen-lockfile --ignore-scripts


# Install all dependencies
install-dev:
	@echo "$(YELLOW)Installing all dependencies...$(NC)"
	@$(PNPM) install --frozen-lockfile --ignore-scripts


# Update dependencies
update:
	@echo "$(YELLOW)Updating dependencies...$(NC)"
	@$(PNPM) update
	@echo "$(GREEN)Dependencies updated successfully!$(NC)"












# Clean build artifacts and cache
clean:
	@echo "$(YELLOW)Cleaning build artifacts and cache...$(NC)"
	@rm -rf $(PROTO_PKG)/lib
	@rm -rf $(CLIENT_PKG)/lib
	@rm -rf packages/mcp/dist
	@rm -rf coverage .nyc_output
	@rm -rf .eslintcache
	@rm -rf .tsbuildinfo
	@rm -f packages/*/tsconfig.tsbuildinfo
	@rm -f packages/*/*.tsbuildinfo
	@echo "$(GREEN)Clean complete!$(NC)"

# Clean everything including generated proto code and node_modules
clean-all: clean
	@echo "$(YELLOW)Cleaning generated proto code and node_modules...$(NC)"
	@rm -rf $(PROTO_OUT)
	@rm -rf node_modules
	@rm -rf packages/*/node_modules
	@echo "$(GREEN)All artifacts cleaned!$(NC)"




# Run unit tests (alias for test-all)
test: test-all


# Lint code
lint:
	@echo "$(YELLOW)Running linting checks...$(NC)"
	@$(PNPM) run lint.check
	@echo "$(GREEN)Linting complete!$(NC)"




# Format code
format:
	@echo "$(YELLOW)Formatting code with Prettier...$(NC)"
	@$(PNPM) exec prettier $(FORMAT_FLAGS) .
	@echo "$(GREEN)Formatting complete!$(NC)"


# Type checking
typecheck:
	@echo "$(YELLOW)Running TypeScript type checking...$(NC)"
	@$(TSC) --build --force
	@echo "$(GREEN)Type checking complete!$(NC)"


# Build TypeScript (alias for build-all)
build: build-all






# Run all CI checks
ci: lint typecheck test-all build-all
	@echo "$(GREEN)All CI checks passed!$(NC)"


# Setup everything
all: install-dev gen-proto build-all
	@echo "$(GREEN)Setup complete!$(NC)"
