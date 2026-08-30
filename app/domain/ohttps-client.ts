import { createHash } from 'node:crypto';

export interface OHTTPSPayload {
  certKey: string;
  fullChainCerts: string;
  expiredTime: string | number;
}

export interface OHTTPSClientOptions {
  endpoint?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** Millisecond clock, injectable for deterministic signatures/tests. */
  now?: () => number;
}

export interface OHTTPSClientConfig extends OHTTPSClientOptions {
  apiId: string;
  apiKey: string;
}

export class OHTTPSClientError extends Error {
  readonly code:
    | 'TIMEOUT'
    | 'NETWORK_ERROR'
    | 'HTTP_ERROR'
    | 'INVALID_JSON'
    | 'API_ERROR'
    | 'INVALID_RESPONSE';
  readonly status?: number;

  constructor(code: OHTTPSClientError['code'], message: string, status?: number) {
    super(message);
    this.name = 'OHTTPSClientError';
    this.code = code;
    this.status = status;
  }
}

/** Adapter for the ohttps API. Keep protocol/signing details in this class. */
export class OHTTPSClient {
  private readonly apiId: string;
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(apiId: string, apiKey: string, options?: OHTTPSClientOptions);
  constructor(config: OHTTPSClientConfig);
  constructor(apiIdOrConfig: string | OHTTPSClientConfig, apiKeyArg?: string, options: OHTTPSClientOptions = {}) {
    const config = typeof apiIdOrConfig === 'string'
      ? { ...options, apiId: apiIdOrConfig, apiKey: apiKeyArg ?? '' }
      : apiIdOrConfig;
    this.apiId = config.apiId;
    this.apiKey = config.apiKey;
    if (!this.apiId || !this.apiKey) throw new Error('ohttps api credentials are required');
    this.endpoint = config.endpoint ?? 'https://ohttps.com/api/open/getCertificate';
    this.timeoutMs = config.timeoutMs ?? 20_000;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.now = config.now ?? Date.now;
  }

  static sign(apiId: string, apiKey: string, certificateId: string, timestamp: number | string): string {
    const plain = `apiId=${apiId}&apiKey=${apiKey}&certificateId=${certificateId}&timestamp=${timestamp}`;
    return createHash('md5').update(plain, 'utf8').digest('hex').toLowerCase();
  }

  async getCertificate(certificateId: string, options: { timestamp?: number | string; signal?: AbortSignal } = {}): Promise<OHTTPSPayload> {
    if (!certificateId) throw new OHTTPSClientError('INVALID_RESPONSE', 'certificateId is required');
    const timestamp = options.timestamp ?? this.now();
    const sign = OHTTPSClient.sign(this.apiId, this.apiKey, certificateId, timestamp);
    const url = new URL(this.endpoint);
    url.searchParams.set('apiId', this.apiId);
    url.searchParams.set('timestamp', String(timestamp));
    url.searchParams.set('certificateId', certificateId);
    url.searchParams.set('sign', sign);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let signal: AbortSignal = controller.signal;
    if (options.signal) {
      const abortAny = (AbortSignal as typeof AbortSignal & { any?: (signals: AbortSignal[]) => AbortSignal }).any;
      if (abortAny) signal = abortAny([options.signal, controller.signal]);
      else {
        if (options.signal.aborted) controller.abort();
        else options.signal.addEventListener('abort', () => controller.abort(), { once: true });
      }
    }
    let response: Response;
    try {
      response = await this.fetchImpl(url, { method: 'GET', signal });
    } catch (error) {
      clearTimeout(timer);
      if ((error as { name?: string })?.name === 'AbortError') {
        throw new OHTTPSClientError('TIMEOUT', `ohttps request timed out after ${this.timeoutMs}ms`);
      }
      throw new OHTTPSClientError('NETWORK_ERROR', 'ohttps request failed');
    }
    let bodyText: string;
    try {
      bodyText = await response.text();
    } catch (error) {
      clearTimeout(timer);
      if ((error as { name?: string })?.name === 'AbortError') throw new OHTTPSClientError('TIMEOUT', `ohttps request timed out after ${this.timeoutMs}ms`);
      bodyText = '';
    }
    clearTimeout(timer);
    if (!response.ok) {
      throw new OHTTPSClientError('HTTP_ERROR', `ohttps returned HTTP ${response.status}`, response.status);
    }
    let body: unknown;
    try {
      body = JSON.parse(bodyText);
    } catch {
      throw new OHTTPSClientError('INVALID_JSON', 'ohttps returned invalid JSON');
    }
    if (!body || typeof body !== 'object') throw new OHTTPSClientError('INVALID_RESPONSE', 'ohttps response must be an object');
    const record = body as Record<string, unknown>;
    if (record.success !== true && record.success !== 'true') {
      const msg = typeof record.msg === 'string' ? redactSensitive(record.msg, this.apiKey) : 'ohttps request was rejected';
      throw new OHTTPSClientError('API_ERROR', msg);
    }
    const payload = record.payload as Record<string, unknown> | undefined;
    const chain = payload && (typeof payload.fullChainCerts === 'string'
      ? payload.fullChainCerts
      : Array.isArray(payload.fullChainCerts) && payload.fullChainCerts.every((v) => typeof v === 'string')
        ? payload.fullChainCerts.join('\n')
        : undefined);
    if (!payload || typeof payload.certKey !== 'string' || chain === undefined ||
      (typeof payload.expiredTime !== 'string' && typeof payload.expiredTime !== 'number')) {
      throw new OHTTPSClientError('INVALID_RESPONSE', 'ohttps response payload is missing certificate fields');
    }
    return {
      certKey: payload.certKey,
      fullChainCerts: chain,
      expiredTime: payload.expiredTime,
    };
  }

  fetchCertificate(certificateId: string, options: { timestamp?: number | string; signal?: AbortSignal } = {}) {
    return this.getCertificate(certificateId, options);
  }
}

/** Redacts credential-like values before writing an error to logs. */
export function redactSensitive(value: string, apiKey?: string): string {
  let result = value.replace(/-----BEGIN (?:[A-Z ]+?)-----[\s\S]*?-----END (?:[A-Z ]+?)-----/g, '[REDACTED_PEM]');
  if (apiKey) result = result.split(apiKey).join('[REDACTED_API_KEY]');
  result = result.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]');
  result = result.replace(/(authorization|api[-_]?key|webhook[-_]?secret)\s*[:=]\s*(?:Bearer\s+)?[^,\s]+/gi, '$1=[REDACTED]');
  return result;
}

export const generateOHTTPSignature = OHTTPSClient.sign;
