const domainPattern = /^(?:\*\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

export function isCertificateDomain(value: string) { return domainPattern.test(value.trim()); }

export function deploymentPaths(domain: string) {
  const name = domain.trim().toLowerCase();
  if (!isCertificateDomain(name)) throw new Error("certificate domain is not safe for a deployment path");
  return { certPath: `/etc/nginx/ssl/${name}/fullchain.pem`, privateKeyPath: `/etc/nginx/ssl/${name}/privkey.pem` };
}
