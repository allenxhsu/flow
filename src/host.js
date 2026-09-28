// STAND-IN for ../shell-kit/js/host.js until shell-kit's iOS shell lands.
// Written against the announced API (initHost({ name, load, command, saved,
// remote, event }), post, hosted, platform); replace it with the real copy:
//   node ../shell-kit/scripts/copy-into.mjs src/host.js
//
// In a browser `hosted` is false, `platform` is null and nothing here does
// anything. Imports nothing, so src/native.js loads under Node.

const injectedName = typeof globalThis.__toolkitHost === 'string' ? globalThis.__toolkitHost : null;
let handler = injectedName ? globalThis.webkit?.messageHandlers?.[injectedName] : null;

/** True inside a shell-kit app (macOS or iOS). */
export const hosted = !!handler;

/** 'ios' | 'macos' inside a shell, null in a browser. */
export const platform = hosted
  ? (globalThis.__toolkitPlatform === 'ios' || globalThis.__toolkitPlatform === 'macos' ? globalThis.__toolkitPlatform
    : /iPhone|iPad|iPod/.test(globalThis.navigator?.userAgent || '') ? 'ios' : 'macos')
  : null;

export function post(message) {
  if (handler) handler.postMessage(message);
}

/**
 * Expose the page's callbacks to the shell and tell it the page is ready.
 * @param {{name: string, load?: Function, command?: Function, saved?: Function, remote?: Function, event?: Function}} api
 */
export function initHost({ name, load = () => {}, command = () => {}, saved = () => {}, remote = () => {}, event = () => {} }) {
  handler = handler || globalThis.webkit?.messageHandlers?.[name] || null;
  if (!handler) return false;
  globalThis[`${name}Host`] = { load, command, saved, remote, event };
  document.documentElement.setAttribute('data-hosted', '');
  post({ type: 'ready' });
  return true;
}
