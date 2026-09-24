import { ConsoleLogger, LogLevel, SilentLogger } from "../src/logger";

describe("Logger", () => {
  describe("ConsoleLogger", () => {
    let consoleSpy: {
      debug: jest.SpyInstance;
      info: jest.SpyInstance;
      warn: jest.SpyInstance;
      error: jest.SpyInstance;
    };

    beforeEach(() => {
      consoleSpy = {
        debug: jest.spyOn(console, "debug").mockImplementation(),
        info: jest.spyOn(console, "info").mockImplementation(),
        warn: jest.spyOn(console, "warn").mockImplementation(),
        error: jest.spyOn(console, "error").mockImplementation(),
      };
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    describe("with DEBUG level", () => {
      it("should log debug messages", () => {
        const logger = new ConsoleLogger(LogLevel.DEBUG);
        logger.debug("debug message", "arg1", "arg2");
        expect(consoleSpy.debug).toHaveBeenCalledWith(
          "[Nzovu DEBUG] debug message",
          "arg1",
          "arg2",
        );
      });

      it("should log info messages", () => {
        const logger = new ConsoleLogger(LogLevel.DEBUG);
        logger.info("info message");
        expect(consoleSpy.info).toHaveBeenCalledWith(
          "[Nzovu INFO] info message",
        );
      });

      it("should log warn messages", () => {
        const logger = new ConsoleLogger(LogLevel.DEBUG);
        logger.warn("warn message");
        expect(consoleSpy.warn).toHaveBeenCalledWith(
          "[Nzovu WARN] warn message",
        );
      });

      it("should log error messages", () => {
        const logger = new ConsoleLogger(LogLevel.DEBUG);
        logger.error("error message");
        expect(consoleSpy.error).toHaveBeenCalledWith(
          "[Nzovu ERROR] error message",
        );
      });
    });

    describe("with INFO level (default)", () => {
      it("should not log debug messages", () => {
        const logger = new ConsoleLogger(LogLevel.INFO);
        logger.debug("debug message");
        expect(consoleSpy.debug).not.toHaveBeenCalled();
      });

      it("should log info messages", () => {
        const logger = new ConsoleLogger(LogLevel.INFO);
        logger.info("info message");
        expect(consoleSpy.info).toHaveBeenCalled();
      });

      it("should log warn messages", () => {
        const logger = new ConsoleLogger(LogLevel.INFO);
        logger.warn("warn message");
        expect(consoleSpy.warn).toHaveBeenCalled();
      });

      it("should log error messages", () => {
        const logger = new ConsoleLogger(LogLevel.INFO);
        logger.error("error message");
        expect(consoleSpy.error).toHaveBeenCalled();
      });
    });

    describe("with WARN level", () => {
      it("should not log debug messages", () => {
        const logger = new ConsoleLogger(LogLevel.WARN);
        logger.debug("debug message");
        expect(consoleSpy.debug).not.toHaveBeenCalled();
      });

      it("should not log info messages", () => {
        const logger = new ConsoleLogger(LogLevel.WARN);
        logger.info("info message");
        expect(consoleSpy.info).not.toHaveBeenCalled();
      });

      it("should log warn messages", () => {
        const logger = new ConsoleLogger(LogLevel.WARN);
        logger.warn("warn message");
        expect(consoleSpy.warn).toHaveBeenCalled();
      });

      it("should log error messages", () => {
        const logger = new ConsoleLogger(LogLevel.WARN);
        logger.error("error message");
        expect(consoleSpy.error).toHaveBeenCalled();
      });
    });

    describe("with ERROR level", () => {
      it("should not log debug messages", () => {
        const logger = new ConsoleLogger(LogLevel.ERROR);
        logger.debug("debug message");
        expect(consoleSpy.debug).not.toHaveBeenCalled();
      });

      it("should not log info messages", () => {
        const logger = new ConsoleLogger(LogLevel.ERROR);
        logger.info("info message");
        expect(consoleSpy.info).not.toHaveBeenCalled();
      });

      it("should not log warn messages", () => {
        const logger = new ConsoleLogger(LogLevel.ERROR);
        logger.warn("warn message");
        expect(consoleSpy.warn).not.toHaveBeenCalled();
      });

      it("should log error messages", () => {
        const logger = new ConsoleLogger(LogLevel.ERROR);
        logger.error("error message");
        expect(consoleSpy.error).toHaveBeenCalled();
      });
    });

    describe("with NONE level", () => {
      it("should not log any messages", () => {
        const logger = new ConsoleLogger(LogLevel.NONE);
        logger.debug("debug message");
        logger.info("info message");
        logger.warn("warn message");
        logger.error("error message");
        expect(consoleSpy.debug).not.toHaveBeenCalled();
        expect(consoleSpy.info).not.toHaveBeenCalled();
        expect(consoleSpy.warn).not.toHaveBeenCalled();
        expect(consoleSpy.error).not.toHaveBeenCalled();
      });
    });

    describe("default level", () => {
      it("should default to INFO level", () => {
        const logger = new ConsoleLogger();
        logger.debug("debug message");
        logger.info("info message");
        expect(consoleSpy.debug).not.toHaveBeenCalled();
        expect(consoleSpy.info).toHaveBeenCalled();
      });
    });
  });

  describe("SilentLogger", () => {
    it("should not throw on any log method", () => {
      const logger = new SilentLogger();
      expect(() => {
        logger.debug();
        logger.info();
        logger.warn();
        logger.error();
      }).not.toThrow();
    });

    it("should return undefined for all methods", () => {
      const logger = new SilentLogger();
      expect(logger.debug()).toBeUndefined();
      expect(logger.info()).toBeUndefined();
      expect(logger.warn()).toBeUndefined();
      expect(logger.error()).toBeUndefined();
    });
  });
});
