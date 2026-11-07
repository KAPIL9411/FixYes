import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

export type GoogleTokenErrorCode =
  | 'INVALID_ID_TOKEN'
  | 'INVALID_SUBJECT'
  | 'INVALID_AUTHORIZED_PARTY'
  | 'AUDIENCE_NOT_CONFIGURED';

export class GoogleTokenError extends Error {
  constructor(readonly code: GoogleTokenErrorCode) {
    super(code);
    this.name = 'GoogleTokenError';
  }
}

export interface GoogleIdentity {
  subject: string;
  email?: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
  nonce?: string;
}

/**
 * Verify a Google ID token cryptographically against Google's JWKS.
 * Never trust decoded client claims. The caller must still check the nonce
 * against a single-use server-issued challenge.
 */
export async function verifyGoogleIdToken(
  idToken: string,
  audiences: string[],
  keySet: JWTVerifyGetKey = GOOGLE_JWKS,
): Promise<GoogleIdentity> {
  if (!idToken || idToken.length > 12_000) throw new GoogleTokenError('INVALID_ID_TOKEN');
  if (audiences.length === 0) throw new GoogleTokenError('AUDIENCE_NOT_CONFIGURED');

  try {
    const { payload } = await jwtVerify(idToken, keySet, {
      audience: audiences,
      issuer: GOOGLE_ISSUERS,
      algorithms: ['RS256'],
      clockTolerance: 5,
    });

    if (!payload.sub) throw new GoogleTokenError('INVALID_SUBJECT');
    if (typeof payload.azp === 'string' && !audiences.includes(payload.azp)) {
      throw new GoogleTokenError('INVALID_AUTHORIZED_PARTY');
    }

    return {
      subject: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      emailVerified: payload.email_verified === true,
      name: typeof payload.name === 'string' ? payload.name : undefined,
      picture: typeof payload.picture === 'string' ? payload.picture : undefined,
      nonce: typeof payload.nonce === 'string' ? payload.nonce : undefined,
    };
  } catch (error) {
    if (error instanceof GoogleTokenError) throw error;
    throw new GoogleTokenError('INVALID_ID_TOKEN');
  }
}
