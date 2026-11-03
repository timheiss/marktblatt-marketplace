import {
  encryptGoogleToken,
  decryptGoogleToken,
} from "./google-token-crypto.server";

import {
  verifyGoogleOAuthState,
} from "./google-oauth-state.server";

const PREFIX = "oauth-state:";

export function encryptGoogleOAuthState(state) {
  if (!verifyGoogleOAuthState(state)) {
    throw new Error(
      "Google OAuth: Ungültiger State für Verschlüsselung."
    );
  }

  return encryptGoogleToken(PREFIX + state);
}

export function decryptGoogleOAuthState(value) {
  const decrypted = decryptGoogleToken(value);

  if (!decrypted.startsWith(PREFIX)) {
    throw new Error(
      "Google OAuth: Verschlüsselte Daten sind kein OAuth-State."
    );
  }

  const state = decrypted.slice(PREFIX.length);

  if (!verifyGoogleOAuthState(state)) {
    throw new Error(
      "Google OAuth: Entschlüsselter State ungültig oder abgelaufen."
    );
  }

  return state;
}