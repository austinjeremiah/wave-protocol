import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'
import { ONESHOT_JWKS_URL } from './constants'

/**
 * 1Shot signs webhook payloads as an EdDSA (Ed25519) JWT. We verify against their
 * public JWKS (confirmed live: kty=OKP, crv=Ed25519). The remote key set is cached and
 * refreshed by jose automatically.
 */
const jwks = createRemoteJWKSet(new URL(ONESHOT_JWKS_URL))

/**
 * Verify a 1Shot webhook JWT.
 * @returns the decoded/verified claims on success, or `null` if the signature is invalid.
 */
export async function verifyOneShotWebhook(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, jwks, { algorithms: ['EdDSA'] })
    return payload
  } catch {
    return null
  }
}
