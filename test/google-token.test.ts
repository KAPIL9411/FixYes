import { beforeAll, describe, expect, it } from 'vitest';
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type CryptoKey,
  type JWTVerifyGetKey,
} from 'jose';
import { GoogleTokenError, verifyGoogleIdToken } from '../src/auth/google-token';

const ISSUER = 'https://accounts.google.com';
const WEB_AUDIENCE = 'web-client.apps.googleusercontent.com';
const IOS_AUDIENCE = 'ios-client.apps.googleusercontent.com';

let privateKey: CryptoKey;
let otherPrivateKey: CryptoKey;
let keySet: JWTVerifyGetKey;

beforeAll(async () => {
  const first = await generateKeyPair('RS256');
  const second = await generateKeyPair('RS256');
  privateKey = first.privateKey;
  otherPrivateKey = second.privateKey;

  const publicJwk = await exportJWK(first.publicKey);
  keySet = createLocalJWKSet({
    keys: [{ ...publicJwk, kid: 'test-key', alg: 'RS256', use: 'sig' }],
  });
});

interface TokenOptions {
  audience?: string;
  issuer?: string;
  expiresAt?: number;
  subject?: string | null;
  azp?: string;
  nonce?: string;
  key?: CryptoKey;
}

async function signToken(options: TokenOptions = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: Record<string, unknown> = {
    email: 'partner@example.com',
    email_verified: true,
    name: 'Test Partner',
    picture: 'https://example.com/avatar.png',
    ...(options.nonce ? { nonce: options.nonce } : {}),
    ...(options.azp ? { azp: options.azp } : {}),
  };

  let token = new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? WEB_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(options.expiresAt ?? now + 300);

  if (options.subject !== null) {
    token = token.setSubject(options.subject ?? 'google-subject-1');
  }

  return token.sign(options.key ?? privateKey);
}

describe('Google ID token verification', () => {
  it('accepts a valid token for any configured audience', async () => {
    const identity = await verifyGoogleIdToken(
      await signToken({ audience: IOS_AUDIENCE, nonce: 'nonce-1' }),
      [WEB_AUDIENCE, IOS_AUDIENCE],
      keySet,
    );

    expect(identity).toEqual({
      subject: 'google-subject-1',
      email: 'partner@example.com',
      emailVerified: true,
      name: 'Test Partner',
      picture: 'https://example.com/avatar.png',
      nonce: 'nonce-1',
    });
  });

  it('rejects a token issued for an unconfigured audience', async () => {
    await expect(
      verifyGoogleIdToken(await signToken({ audience: 'other-client' }), [WEB_AUDIENCE], keySet),
    ).rejects.toMatchObject({ code: 'INVALID_ID_TOKEN' });
  });

  it('rejects a token from the wrong issuer', async () => {
    await expect(
      verifyGoogleIdToken(await signToken({ issuer: 'https://evil.example' }), [WEB_AUDIENCE], keySet),
    ).rejects.toMatchObject({ code: 'INVALID_ID_TOKEN' });
  });

  it('rejects an expired token', async () => {
    const expiredAt = Math.floor(Date.now() / 1000) - 60;
    await expect(
      verifyGoogleIdToken(await signToken({ expiresAt: expiredAt }), [WEB_AUDIENCE], keySet),
    ).rejects.toMatchObject({ code: 'INVALID_ID_TOKEN' });
  });

  it('rejects a token with a bad signature', async () => {
    await expect(
      verifyGoogleIdToken(await signToken({ key: otherPrivateKey }), [WEB_AUDIENCE], keySet),
    ).rejects.toMatchObject({ code: 'INVALID_ID_TOKEN' });
  });

  it('rejects a token without a subject', async () => {
    await expect(
      verifyGoogleIdToken(await signToken({ subject: null }), [WEB_AUDIENCE], keySet),
    ).rejects.toMatchObject({ code: 'INVALID_SUBJECT' });
  });

  it('rejects an authorized party outside the audience allowlist', async () => {
    await expect(
      verifyGoogleIdToken(await signToken({ azp: 'other-client' }), [WEB_AUDIENCE], keySet),
    ).rejects.toMatchObject({ code: 'INVALID_AUTHORIZED_PARTY' });
  });

  it('fails closed with no configured audiences', async () => {
    await expect(verifyGoogleIdToken(await signToken(), [], keySet)).rejects.toBeInstanceOf(
      GoogleTokenError,
    );
  });
});
