const stamp = () => new Date().toISOString();

/** Tiny timestamped logger; `name` tags every line with its component. */
export const createLogger = (name) => ({
  info: (...msg) => console.log(`${stamp()} [${name}]`, ...msg),
  error: (...msg) => console.error(`${stamp()} [${name}]`, ...msg),
});

/** Logger that drops everything — used to keep test output readable. */
export const silentLogger = { info: () => {}, error: () => {} };
