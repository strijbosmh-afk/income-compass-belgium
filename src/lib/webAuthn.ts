const PREFIX = 'myfinstate-passkey';
const LAST_USER_KEY = `${PREFIX}:last-user`;

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function randomChallenge() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytes;
}

function credentialKey(userId: string) {
  return `${PREFIX}:${userId}`;
}

export function isWebAuthnAvailable() {
  return typeof window !== 'undefined' &&
    window.isSecureContext &&
    Boolean(navigator.credentials) &&
    typeof PublicKeyCredential !== 'undefined';
}

export async function isPlatformAuthenticatorAvailable() {
  if (!isWebAuthnAvailable()) return false;
  return PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
}

export function hasLocalPasskey(userId: string) {
  return Boolean(localStorage.getItem(credentialKey(userId)));
}

export function getLastPasskeyUser() {
  try {
    return JSON.parse(localStorage.getItem(LAST_USER_KEY) || 'null') as { userId: string; label: string; createdAt: string } | null;
  } catch {
    return null;
  }
}

export async function registerLocalPasskey(userId: string, label = 'MyFinState') {
  if (!isWebAuthnAvailable()) throw new Error('Touch ID is niet beschikbaar in deze browser.');

  const idBytes = new TextEncoder().encode(userId);
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: randomChallenge(),
      rp: { name: 'MyFinState' },
      user: {
        id: idBytes,
        name: label,
        displayName: label,
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        residentKey: 'preferred',
        userVerification: 'required',
      },
      timeout: 60_000,
      attestation: 'none',
    },
  });

  if (!(credential instanceof PublicKeyCredential)) {
    throw new Error('Touch ID registratie is geannuleerd.');
  }

  localStorage.setItem(credentialKey(userId), JSON.stringify({
    id: credential.id,
    rawId: bytesToBase64Url(new Uint8Array(credential.rawId)),
    createdAt: new Date().toISOString(),
  }));
  localStorage.setItem(LAST_USER_KEY, JSON.stringify({
    userId,
    label,
    createdAt: new Date().toISOString(),
  }));

  if (!hasLocalPasskey(userId)) {
    throw new Error('Touch ID werd aangemaakt, maar kon niet lokaal worden bewaard. Controleer browser privacy-instellingen.');
  }
}

export async function verifyLocalPasskey(userId: string) {
  if (!isWebAuthnAvailable()) throw new Error('Touch ID is niet beschikbaar in deze browser.');
  const stored = localStorage.getItem(credentialKey(userId));
  if (!stored) throw new Error('Touch ID is nog niet ingeschakeld op deze Mac.');
  const credential = JSON.parse(stored) as { rawId: string };

  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: randomChallenge(),
      allowCredentials: [{
        id: base64UrlToBytes(credential.rawId),
        type: 'public-key',
        transports: ['internal'],
      }],
      userVerification: 'required',
      timeout: 60_000,
    },
  });

  if (!(assertion instanceof PublicKeyCredential)) {
    throw new Error('Touch ID ontgrendeling is geannuleerd.');
  }
}
