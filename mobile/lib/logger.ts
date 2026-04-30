type LogContext = Record<string, unknown>;

function emit(level: 'info' | 'warn' | 'error', message: string, context?: LogContext): void {
  if (!__DEV__) {
    // TODO(yashua): pipe `error` to Sentry once monitoring is wired up.
    return;
  }
  const payload = context ? `${message} ${JSON.stringify(context)}` : message;
  if (level === 'error') {
    console.error(payload);
  } else if (level === 'warn') {
    console.warn(payload);
  } else {
    console.log(payload);
  }
}

export const logger = {
  info: (message: string, context?: LogContext) => emit('info', message, context),
  warn: (message: string, context?: LogContext) => emit('warn', message, context),
  error: (message: string, context?: LogContext) => emit('error', message, context),
};
