import { format as formatDate } from "https://deno.land/std@0.196.0/datetime/mod.ts";
import {
  LoggerConfig,
  LogLevels,
  LogRecord,
} from "https://deno.land/std@0.196.0/log/mod.ts";

// dev utility logger names
export const DevLoggerName = "dev";

// internal logger names
export const ControlLoggerName = "control";

export function defaultLogFormatter(rec: LogRecord) {
  let level: string;
  switch (rec.level) {
    case LogLevels.INFO:
      level = "INFO";
      break;
    case LogLevels.WARNING:
      level = "WARN";
      break;
    case LogLevels.ERROR:
      level = "EROR";
      break;
    case LogLevels.CRITICAL:
      level = "CRIT";
      break;
    default:
      level = "DBUG";
      break;
  }
  return `[${
    formatDate(new Date(), "yyyy-MM-dd HH:mm:ss")
  } ${level}][${rec.loggerName}] ${rec.msg}`;
}

export function getInternalLoggers(config: LoggerConfig) {
  return [ControlLoggerName].reduce((acc, loggerName) => {
    return { ...acc, [loggerName]: config };
  }, {} as Record<string, LoggerConfig>);
}
