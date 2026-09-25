/**
 * Logging Best Practices Example
 *
 * This example demonstrates different logging configurations for the Nzovu client.
 */

import {
  NzovuClient,
  ConsoleLogger,
  LogLevel,
  Logger,
  SilentLogger,
} from "@nzovu/client";

// ============================================================================
// Example 1: Default Logging (WARN level)
// ============================================================================
async function defaultLoggingExample() {
  console.log("\n=== Example 1: Default Logging (WARN level) ===\n");

  const client = new NzovuClient({
    connection: {
      insecure: process.env.NZOVU_INSECURE === "true",
      apiKey: process.env.NZOVU_API_KEY,
      address: process.env.NZOVU_ADDRESS || "localhost:9000",
    },
  });
  // Default logger: Only shows WARN and ERROR messages

  await client.connect();
  console.log("Client connected with default logging");
  await client.disconnect();
}

// ============================================================================
// Example 2: Silent Logging (Production)
// ============================================================================
async function silentLoggingExample() {
  console.log("\n=== Example 2: Silent Logging (No output) ===\n");

  const client = new NzovuClient({
    connection: {
      insecure: process.env.NZOVU_INSECURE === "true",
      apiKey: process.env.NZOVU_API_KEY,
      address: process.env.NZOVU_ADDRESS || "localhost:9000",
    },
    logger: new SilentLogger(), // No SDK logs at all
  });

  await client.connect();
  console.log("Client connected with silent logging (no SDK output)");
  await client.disconnect();
}

// ============================================================================
// Example 3: Debug Logging (Development)
// ============================================================================
async function debugLoggingExample() {
  console.log("\n=== Example 3: Debug Logging (All messages) ===\n");

  const client = new NzovuClient({
    connection: {
      insecure: process.env.NZOVU_INSECURE === "true",
      apiKey: process.env.NZOVU_API_KEY,
      address: process.env.NZOVU_ADDRESS || "localhost:9000",
    },
    logger: new ConsoleLogger(LogLevel.DEBUG), // Show all logs including DEBUG
  });

  await client.connect();
  console.log("Client connected with debug logging");

  // This will show debug messages for heartbeats
  const { message, stopHeartbeat } = await client.messages.getNextMessage(
    "test-queue",
    undefined,
    undefined,
    true, // Enable heartbeat
    5000, // 5 second interval
  );

  if (message && stopHeartbeat) {
    // Wait a bit to see heartbeat debug logs
    await new Promise((resolve) => setTimeout(resolve, 12000));
    stopHeartbeat();
  }

  await client.disconnect();
}

// ============================================================================
// Example 4: Custom Logger Implementation
// ============================================================================
class CustomLogger implements Logger {
  private logToFile(level: string, message: string, ...args: any[]): void {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] ${message} ${JSON.stringify(args)}`;
    // In real app: write to file, send to logging service, etc.
    // eslint-disable-next-line no-console
    console.log(`[CUSTOM] ${logEntry}`);
  }

  debug(message: string, ...args: any[]): void {
    this.logToFile("DEBUG", message, ...args);
  }

  info(message: string, ...args: any[]): void {
    this.logToFile("INFO", message, ...args);
  }

  warn(message: string, ...args: any[]): void {
    this.logToFile("WARN", message, ...args);
  }

  error(message: string, ...args: any[]): void {
    this.logToFile("ERROR", message, ...args);
  }
}

async function customLoggingExample() {
  console.log("\n=== Example 4: Custom Logger ===\n");

  const client = new NzovuClient({
    connection: {
      insecure: process.env.NZOVU_INSECURE === "true",
      apiKey: process.env.NZOVU_API_KEY,
      address: process.env.NZOVU_ADDRESS || "localhost:9000",
    },
    logger: new CustomLogger(), // Your custom implementation
  });

  await client.connect();
  console.log("Client connected with custom logger");
  await client.disconnect();
}

// ============================================================================
// Example 5: Integration with Popular Logging Libraries
// ============================================================================

// Example with Winston (popular Node.js logger)
// Note: Requires `npm install winston`
/*
import winston from 'winston';

class WinstonLogger implements Logger {
    private winston: winston.Logger;

    constructor() {
        this.winston = winston.createLogger({
            level: 'debug',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            ),
            transports: [
                new winston.transports.File({ filename: 'nzovu-error.log', level: 'error' }),
                new winston.transports.File({ filename: 'nzovu-combined.log' }),
                new winston.transports.Console({ format: winston.format.simple() })
            ],
        });
    }

    debug(message: string, ...args: any[]): void {
        this.winston.debug(message, { args });
    }

    info(message: string, ...args: any[]): void {
        this.winston.info(message, { args });
    }

    warn(message: string, ...args: any[]): void {
        this.winston.warn(message, { args });
    }

    error(message: string, ...args: any[]): void {
        this.winston.error(message, { args });
    }
}

async function winstonLoggingExample() {
    const client = new NzovuClient({
        connection: {
      insecure: process.env.NZOVU_INSECURE === "true",
      apiKey: process.env.NZOVU_API_KEY, address: 'host.docker.internal:9000' },
        logger: new WinstonLogger(),
    });
    
    await client.connect();
    await client.disconnect();
}
*/

// ============================================================================
// Best Practices Summary
// ============================================================================

async function main() {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║        Nzovu Client - Logging Best Practices       ║");
  console.log("╚═══════════════════════════════════════════════════════════╝");

  console.log("\n📝 Logging Recommendations:\n");
  console.log("1. Development:   Use ConsoleLogger(LogLevel.DEBUG)");
  console.log("2. Staging:       Use ConsoleLogger(LogLevel.INFO)");
  console.log(
    "3. Production:    Use ConsoleLogger(LogLevel.WARN) or SilentLogger",
  );
  console.log(
    "4. Enterprise:    Implement custom Logger with external service\n",
  );

  console.log("🔧 Configuration Examples:\n");

  try {
    await defaultLoggingExample();
    await silentLoggingExample();
    // Uncomment to test debug logging (requires server):
    // await debugLoggingExample();
    await customLoggingExample();
  } catch (err) {
    // Note: These examples will fail without a running server
    console.log("\n⚠️  Examples require a running Nzovu server");
    console.log(
      "   The purpose is to demonstrate configuration, not functionality",
    );
  }

  console.log("\n✅ Logging examples completed!\n");
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("❌ Error:", err);
  process.exit(1);
});
