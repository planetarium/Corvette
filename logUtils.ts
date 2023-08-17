import { format as formatDate } from "std/datetime/mod.ts";
import {
  Logger,
  type LoggerConfig,
  LogLevels,
  type LogRecord,
} from "std/log/mod.ts";
import { type LevelName, LogLevelNames } from "std/log/levels.ts";

import { combinedEnv, LogLevelEnvKey } from "./envUtils.ts";

// outside facing component logger names
export const ObserverLoggerName = "observer";
export const EmitterLoggerName = "emitter";
export const ApiLoggerName = "api";
export const WebLoggerName = "web";

// dev utility logger names
export const DevLoggerName = "dev";
export const DataproxyLoggerName = "dataproxy";
export const TestWebhookReceiverLoggerName = "testWebhookReceiver";

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
  } ${level}][${rec.loggerName}] ${
    [rec.msg, ...rec.args.map(Logger.prototype.asString)].join(" ")
  }`;
}

export function getLoggingLevel() {
  const level = combinedEnv[LogLevelEnvKey] || "NOTSET";
  if (!LogLevelNames.includes(level)) {
    throw new Error(
      `${LogLevelEnvKey} must be set to one of '${
        LogLevelNames.join("', '")
      }'.`,
    );
  }
  return level as LevelName;
}

export function getInternalLoggers(config: LoggerConfig) {
  return [ControlLoggerName].reduce((acc, loggerName) => {
    return { ...acc, [loggerName]: config };
  }, {} as Record<string, LoggerConfig>);
}
