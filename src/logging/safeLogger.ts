import { createSafeLogEvent, type UnsafeLogEvent } from "../privacy/redaction";

export interface SafeLoggerOptions {
  readonly debugEnabled: boolean;
  readonly sink: (line: string) => void;
}

export interface SafeLogger {
  debug(event: UnsafeLogEvent): void;
}

export const createSafeLogger = (options: SafeLoggerOptions): SafeLogger => {
  return {
    debug(event: UnsafeLogEvent): void {
      if (!options.debugEnabled) {
        return;
      }

      options.sink(JSON.stringify(createSafeLogEvent(event)));
    },
  };
};
