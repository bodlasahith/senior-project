/**
 * Dev-only logging. Routine progress messages go through debug() so release
 * builds stay quiet; real problems still use console.warn / console.error.
 * @param {...any} args
 */
export function debug(...args) {
  if (__DEV__) console.log(...args);
}
