type LogContext = Record<string, unknown>;

// JSON.stringify on Error instances drops everything — `message`, `name`,
// and `stack` are non-enumerable. We unwrap them explicitly here so error
// logs surface what actually went wrong instead of `{}`. Applies recursively
// for things like { error: <Error>, receiptId: '...' } as well as bare
// errors.
function unwrapErrors(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[max-depth]';
  if (value instanceof Error) {
    const out: Record<string, unknown> = {
      name: value.name,
      message: value.message,
    };
    if (value.stack) out.stack = value.stack;
    // Some error libraries (Supabase, fetch wrappers) attach extra fields.
    // Copy enumerable own props so we don't lose codes / status / details.
    for (const key of Object.keys(value)) {
      if (key in out) continue;
      out[key] = unwrapErrors((value as unknown as Record<string, unknown>)[key], depth + 1);
    }
    return out;
  }
  if (Array.isArray(value)) return value.map((v) => unwrapErrors(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = unwrapErrors(v, depth + 1);
    return out;
  }
  return value;
}

function emit(level: 'info' | 'warn' | 'error', message: string, context?: LogContext): void {
  if (!__DEV__) {
    // TODO(yashua): pipe `error` to Sentry once monitoring is wired up.
    return;
  }
  const payload = context
    ? `${message} ${JSON.stringify(unwrapErrors(context))}`
    : message;
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
