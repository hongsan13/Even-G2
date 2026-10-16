export function serviceManifest(original, service) {
  const manifest = structuredClone(original);
  if (!service) return manifest;
  const u = new URL(service);
  if (u.protocol !== 'https:' || u.username || u.password || u.pathname !== '/' || u.search || u.hash) throw new Error('TRANSIT_SERVICE_URL must be an HTTPS origin');
  const network = manifest.permissions.find(p => p.name === 'network');
  if (!network) throw new Error('Network permission is missing');
  network.whitelist = [...new Set([...network.whitelist, u.origin])];
  return manifest;
}
