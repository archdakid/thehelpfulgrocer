type LogContext = Record<string, unknown>;

// JSON.stringify on Error instances drops everything — `message`, `name`,
// and `stack` are non-enumerable. We unwrap them explicitly here so error
// logs surface what actually went wrong instead of `{}`. Applies recursively
// for things like { error: <Error>, receiptId: '...' } as well as bare
// errors.
function unwrapErrors(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[max-depth]';
  try {
    if (value instanceof Error) {
      const out: Record<string, unknown> = {
        name: value.name,
        message: value.message,
      };
      if (value.stack) out.stack = value.stack;
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
    if (value === null) return '<null>';
    if (value === undefined) return '<undefined>';
    return value;
  } catch (err) {
    return `[unwrap-failed: ${err instanceof Error ? err.message : String(err)}]`;
  }
}

// JSON.stringify can throw (circular refs, BigInt, getters that throw) and
// can return undefined for top-level undefined / functions. We wrap it so
// emit() never produces undefined or throws — both have caused this logger
// to surface useless "null" / "undefined" lines in Metro.
function safeSerialize(value: unknown): string {
  try {
    const s = JSON.stringify(value, null, 2);
    if (s === undefined) return String(value);
    return s;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `[serialize-failed: ${msg}]`;
  }
}

function emit(level: 'info' | 'warn' | 'error', message: string, context?: LogContext): void {
  if (!__DEV__) {
    // TODO(yashua): pipe `error` to Sentry once monitoring is wired up.
    return;
  }
  const consoleFn =
    level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  // Pass message and serialized context as separate args. Metro's console
  // bridge sometimes mangles a single template-literal payload (turns into
  // "null" if any sub-expression evaluates to undefined). Two args are
  // rendered side-by-side and the message survives even if serialization
  // breaks.
  if (context !== undefined) {
    consoleFn(message, safeSerialize(unwrapErrors(context)));
  } else {
    consoleFn(message);
  }
}

export const logger = {
  info: (message: string, context?: LogContext) => emit('info', message, context),
  warn: (message: string, context?: LogContext) => emit('warn', message, context),
  error: (message: string, context?: LogContext) => emit('error', message, context),
};
