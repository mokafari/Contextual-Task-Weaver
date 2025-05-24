
// Basic logger utility
// In a real app, this could be extended to send logs to a remote service.

enum LogLevel {
  LOG = "LOG",
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
  DEBUG = "DEBUG"
}

const log = (level: LogLevel, component: string, funcName: string, message: string, ...data: any[]) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] [${component}${funcName ? `.${funcName}` : ''}]: ${message}`;
  
  switch (level) {
    case LogLevel.ERROR:
      console.error(logMessage, ...data);
      break;
    case LogLevel.WARN:
      console.warn(logMessage, ...data);
      break;
    case LogLevel.INFO:
      console.info(logMessage, ...data);
      break;
    case LogLevel.DEBUG:
      // For debug, only log if a specific flag is set (e.g., in localStorage or a global const)
      // For now, let's use console.debug which might be filtered by browser devtools
      console.debug(logMessage, ...data);
      break;
    default:
      console.log(logMessage, ...data);
  }
};

export const logger = {
  log: (component: string, funcName: string, message: string, ...data: any[]) => 
    log(LogLevel.LOG, component, funcName, message, ...data),
  info: (component: string, funcName: string, message: string, ...data: any[]) =>
    log(LogLevel.INFO, component, funcName, message, ...data),
  warn: (component: string, funcName: string, message: string, ...data: any[]) =>
    log(LogLevel.WARN, component, funcName, message, ...data),
  error: (component: string, funcName: string, message: string, errorObject?: any, ...data: any[]) => {
    if (errorObject) {
      log(LogLevel.ERROR, component, funcName, `${message} - Details: ${errorObject?.message || errorObject}`, errorObject, ...data);
    } else {
      log(LogLevel.ERROR, component, funcName, message, ...data);
    }
  },
  debug: (component: string, funcName: string, message: string, ...data: any[]) =>
    log(LogLevel.DEBUG, component, funcName, message, ...data),
};
