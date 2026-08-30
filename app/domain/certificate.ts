import { createPrivateKey, createPublicKey, X509Certificate } from 'node:crypto';

export interface ParsedCertificate {
  certificatePem: string;
  privateKeyPem: string;
  fingerprint: string;
  notBefore: Date;
  notAfter: Date;
  subject: string;
  sans: string[];
}

export interface CertificateValidationOptions {
  /** Require at least one of these names to appear in the leaf SAN list. */
  requiredSans?: string[];
  now?: Date;
  /** Internal use for reading historical/expired cache entries. */
  checkValidity?: boolean;
}

function normalizePem(value: string): string {
  return value.trim().replace(/\\n/g, '\n') + '\n';
}

function parseSans(cert: X509Certificate): string[] {
  const value = cert.subjectAltName ?? '';
  return value.split(',').map((item) => item.trim()).map((item) => item.replace(/^DNS:/i, '').replace(/^IP Address:/i, '')).filter(Boolean);
}

/** Parse and validate leaf certificate, private key pairing and validity period. */
export function validateCertificatePair(
  certificatePemInput: string,
  privateKeyPemInput: string,
  options: CertificateValidationOptions = {},
): ParsedCertificate {
  const certificatePem = normalizePem(certificatePemInput);
  const privateKeyPem = normalizePem(privateKeyPemInput);
  let cert: X509Certificate;
  try {
    cert = new X509Certificate(certificatePem);
  } catch {
    throw new Error('invalid certificate PEM');
  }
  let privateKey;
  try {
    privateKey = createPrivateKey(privateKeyPem);
  } catch {
    throw new Error('invalid private key PEM');
  }
  const certPublic = cert.publicKey.export({ type: 'spki', format: 'der' });
  const keyPublic = createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
  if (!Buffer.from(certPublic).equals(Buffer.from(keyPublic))) throw new Error('certificate and private key do not match');

  const notBefore = new Date(cert.validFrom);
  const notAfter = new Date(cert.validTo);
  if (Number.isNaN(notBefore.valueOf()) || Number.isNaN(notAfter.valueOf())) throw new Error('certificate validity dates are invalid');
  const now = options.now ?? new Date();
  if (options.checkValidity !== false) {
    if (now < notBefore) throw new Error('certificate is not yet valid');
    if (now >= notAfter) throw new Error('certificate is expired');
  }

  const sans = parseSans(cert);
  for (const required of options.requiredSans ?? []) {
    const wanted = required.toLowerCase();
    const matched = sans.some((san) => {
      const value = san.toLowerCase();
      if (value === wanted) return true;
      return value.startsWith('*.') && wanted.endsWith(value.slice(1)) && wanted.split('.').length === value.split('.').length;
    });
    if (!matched) throw new Error(`certificate SAN does not include ${required}`);
  }
  return {
    certificatePem,
    privateKeyPem,
    fingerprint: cert.fingerprint256,
    notBefore,
    notAfter,
    subject: cert.subject,
    sans,
  };
}

export function isWithinRenewalWindow(notAfter: Date, now = new Date(), renewBeforeMs = 20 * 24 * 60 * 60 * 1000): boolean {
  return notAfter.getTime() - now.getTime() <= renewBeforeMs;
}

export function parseRemoteExpiry(value: string | number): Date | undefined {
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  return Number.isNaN(date.valueOf()) ? undefined : date;
}
