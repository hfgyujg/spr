/**
 * Client-side auth storage hardening.
 *
 * Firebase owns the live authentication session. SPR must never persist a Firebase
 * ID token in localStorage. This module sanitizes the legacy `msp_user` record and
 * prevents future writes from persisting a token while preserving non-sensitive
 * session metadata used by the UI.
 */
const SESSION_KEY = 'msp_user';

function sanitize(value: string): string {
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object') {
      delete parsed.token;
      delete parsed.idToken;
      delete parsed.accessToken;
      delete parsed.refreshToken;
      return JSON.stringify(parsed);
    }
  } catch {
    // Preserve non-JSON values rather than throwing from Storage APIs.
  }
  return value;
}

try {
  const existing = window.localStorage.getItem(SESSION_KEY);
  if (existing) {
    window.localStorage.setItem(SESSION_KEY, sanitize(existing));
  }

  const storagePrototype = Storage.prototype;
  const originalSetItem = storagePrototype.setItem;
  const marker = '__sprAuthStorageHardened__';

  if (!(storagePrototype as any)[marker]) {
    Object.defineProperty(storagePrototype, marker, {
      value: true,
      configurable: false,
      enumerable: false,
      writable: false,
    });

    storagePrototype.setItem = function hardenedSetItem(key: string, value: string) {
      return originalSetItem.call(this, key, key === SESSION_KEY ? sanitize(value) : value);
    };
  }
} catch (error) {
  console.warn('[SPR Auth Storage] Could not initialize storage hardening:', error);
}
