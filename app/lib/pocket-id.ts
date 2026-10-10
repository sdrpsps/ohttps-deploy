import type { BetterAuthPlugin } from "better-auth"
import { APIError } from "better-auth/api"
import { genericOAuth } from "better-auth/plugins"
import { createRemoteJWKSet, customFetch, jwtVerify } from "jose"
import { z } from "zod"

export function loadPocketIdConfig(env: Record<string, string | undefined> = process.env) {
  const keys = ["POCKET_ID_ISSUER", "POCKET_ID_CLIENT_ID", "POCKET_ID_CLIENT_SECRET"] as const
  if (!keys.some((key) => env[key]?.trim())) return undefined
  if (keys.some((key) => !env[key]?.trim())) throw new Error("Pocket ID configuration requires POCKET_ID_ISSUER, POCKET_ID_CLIENT_ID and POCKET_ID_CLIENT_SECRET")
  let issuer: URL
  try { issuer = new URL(env.POCKET_ID_ISSUER!.trim()) } catch { throw new Error("Invalid POCKET_ID_ISSUER") }
  if (issuer.protocol !== "https:" || issuer.username || issuer.password || issuer.search || issuer.hash) throw new Error("POCKET_ID_ISSUER must be an HTTPS URL without credentials, query or fragment")
  return {
    issuer: issuer.href.replace(/\/$/, ""),
    clientId: env.POCKET_ID_CLIENT_ID!.trim(),
    clientSecret: env.POCKET_ID_CLIENT_SECRET!.trim(),
  }
}

export type PocketIdConfig = NonNullable<ReturnType<typeof loadPocketIdConfig>>

/** Keep local identities and sessions scoped to this issuer and client. */
export function pocketIdAccountIssuer(config: PocketIdConfig) {
  return `${config.issuer}#client=${encodeURIComponent(config.clientId)}`
}

export function pocketIdProfileImage(value: unknown) {
  if (typeof value !== "string") return undefined
  try {
    const url = new URL(value)
    if (url.protocol !== "https:" || url.username || url.password) return undefined
    return url.href
  } catch { return undefined }
}

const discoverySchema = z.object({
  issuer: z.string(),
  authorization_endpoint: z.string().url(),
  token_endpoint: z.string().url(),
  jwks_uri: z.string().url(),
})
const tokenSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().refine((value) => value.toLowerCase() === "bearer"),
  id_token: z.string().min(1),
  expires_in: z.number().positive().optional(),
})

/** Keep provider I/O bounded and errors free of codes, tokens and upstream bodies. */
export function pocketIdPlugin(config: PocketIdConfig, fetcher: typeof fetch = fetch): BetterAuthPlugin {
  async function requestJson(url: string, init?: RequestInit) {
    try {
      const response = await fetcher(url, { ...init, redirect: "error", signal: AbortSignal.timeout(10_000) })
      if (!response.ok) throw new Error()
      return await response.json()
    } catch { throw new Error("Pocket ID request failed") }
  }
  // Discovery is lazy: an unavailable IdP must not block password login or Worker startup.
  let discovery: Promise<z.infer<typeof discoverySchema>> | undefined
  function discover() {
    return discovery ??= (async () => {
      try {
        const data = discoverySchema.parse(await requestJson(`${config.issuer}/.well-known/openid-configuration`))
        if (data.issuer !== config.issuer) throw new Error()
        for (const endpoint of [data.authorization_endpoint, data.token_endpoint, data.jwks_uri]) {
          const url = new URL(endpoint)
          if (url.origin !== new URL(config.issuer).origin || url.username || url.password || url.hash) throw new Error()
        }
        return data
      } catch {
        discovery = undefined
        throw new Error("Pocket ID discovery failed")
      }
    })()
  }
  let jwks: ReturnType<typeof createRemoteJWKSet> | undefined
  const plugin = genericOAuth({ config: [{
    providerId: "pocket-id",
    name: "Pocket ID",
    accountIssuer: pocketIdAccountIssuer(config),
    // Only verified ID tokens reach account resolution. Pocket ID enforces this client's allowed groups.
    accountSubject: ({ profile }) => typeof profile.sub === "string" ? profile.sub : "",
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    // Actual endpoints are read from discovery when a login starts.
    authorizationUrl: `${config.issuer}/authorize`,
    scopes: ["openid", "profile", "email"],
    pkce: true,
    disableSignUp: false,
    overrideUserInfo: true,
    disableProviderLogout: true,
    async getToken({ code, redirectURI, codeVerifier }) {
      try {
        const metadata = await discover()
        const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectURI, client_id: config.clientId, client_secret: config.clientSecret })
        if (!codeVerifier) throw new Error()
        body.set("code_verifier", codeVerifier)
        const tokens = tokenSchema.parse(await requestJson(metadata.token_endpoint, { method: "POST", body }))
        return { accessToken: tokens.access_token, idToken: tokens.id_token, accessTokenExpiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : undefined }
      } catch { throw new Error("Pocket ID token exchange failed") }
    },
  }] })
  return {
    ...plugin,
    async init(context) {
      const result = await plugin.init(context)
      const provider = result.context.socialProviders[0]!
      provider.issuer = config.issuer
      provider.requiresIdTokenNonce = true
      const createAuthorizationURL = provider.createAuthorizationURL.bind(provider)
      provider.createAuthorizationURL = async (data) => {
        try {
          const metadata = await discover()
          const generated = await createAuthorizationURL(data)
          const url = new URL(metadata.authorization_endpoint)
          for (const [key, value] of generated.searchParams) url.searchParams.set(key, value)
          return url
        } catch {
          context.logger.warn("Pocket ID authorization unavailable")
          throw new APIError("SERVICE_UNAVAILABLE", { code: "POCKET_ID_UNAVAILABLE", message: "Pocket ID login unavailable" })
        }
      }
      provider.getUserInfo = async (tokens) => {
        try {
          if (!tokens.idToken || !tokens.expectedIdTokenNonce) return null
          const metadata = await discover()
          jwks ??= createRemoteJWKSet(new URL(metadata.jwks_uri), { timeoutDuration: 10_000, [customFetch]: fetcher })
          const { payload } = await jwtVerify(tokens.idToken, jwks, { issuer: config.issuer, audience: config.clientId, algorithms: ["RS256", "ES256"], requiredClaims: ["sub", "exp", "iat", "nonce"] })
          if ((payload.azp !== undefined && payload.azp !== config.clientId) || (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== config.clientId)) return null
          if (payload.nonce !== tokens.expectedIdTokenNonce || typeof payload.sub !== "string" || !payload.sub.trim() || typeof payload.email !== "string" || !payload.email) return null
          const name = [payload.name, payload.preferred_username, payload.email].find((value) => typeof value === "string" && value.trim()) as string
          return { user: { email: payload.email, emailVerified: payload.email_verified === true, name, image: pocketIdProfileImage(payload.picture) }, data: payload }
        } catch { return null }
      }
      return result
    },
  }
}
