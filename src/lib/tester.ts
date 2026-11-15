import type { ParsedConfig, ParsedEndpoint } from './parser';
import { isNative } from './native';
import { NetProbe } from './netprobe';

export interface NetworkInfo {
  ip: string;
  isp: string;
  country: string;
  countryCode: string;
  flag: string;
  city: string;
}

export interface GeoInfo {
  country: string;
  countryCode: string;
  flag: string;
  city: string;
  org: string;
}

export type EndpointStatus = 'working' | 'likely' | 'blocked' | 'dead';

export interface EndpointResult {
  host: string;
  port: number;
  kind: ParsedEndpoint['kind'];
  status: EndpointStatus;
  ip?: string;
  dnsMs?: number;
  latency?: number;
  detail: string;
  geo?: GeoInfo;
}

export type Verdict = 'working' | 'likely' | 'dead' | 'unreadable';

export interface ConfigResult {
  id: string;
  name: string;
  format: string;
  encrypted: boolean;
  verdict: Verdict;
  best?: EndpointResult;
  endpoints: EndpointResult[];
  testedAt: number;
  isp: string;
  network: string;
  country?: string;
  countryCode?: string;
  flag?: string;
}

const flagFromCode = (cc?: string) =>
  cc && cc.length === 2
    ? String.fromCodePoint(...cc.toUpperCase().split('').map((c) => 127397 + c.charCodeAt(0)))
    : '🌐';

function withTimeout(ms: number) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  return { signal: ctl.signal, done: () => clearTimeout(t) };
}

export async function getNetworkInfo(): Promise<NetworkInfo> {
  const t = withTimeout(8000);
  try {
    const r = await fetch('https://ipwho.is/', { signal: t.signal });
    const j = await r.json();
    if (j.success === false) throw new Error('fail');
    return {
      ip: j.ip,
      isp: j.connection?.isp || j.connection?.org || 'Unknown provider',
      country: j.country,
      countryCode: j.country_code,
      flag: flagFromCode(j.country_code),
      city: j.city || '',
    };
  } catch {
    const t2 = withTimeout(8000);
    try {
      const r = await fetch('https://ipapi.co/json/', { signal: t2.signal });
      const j = await r.json();
      return {
        ip: j.ip,
        isp: j.org || 'Unknown provider',
        country: j.country_name,
        countryCode: j.country_code,
        flag: flagFromCode(j.country_code),
        city: j.city || '',
      };
    } finally {
      t2.done();
    }
  } finally {
    t.done();
  }
}

async function resolveHost(host: string): Promise<{ ip: string; ms: number }> {
  const start = performance.now();
  const providers = [
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=A`,
    `https://dns.google/resolve?name=${encodeURIComponent(host)}&type=A`,
  ];
  let lastErr: unknown = new Error('DNS failed');
  for (const url of providers) {
    const t = withTimeout(6000);
    try {
      const r = await fetch(url, { headers: { accept: 'application/dns-json' }, signal: t.signal });
      const j = await r.json();
      if (j.Status === 3) throw new Error('NXDOMAIN');
      const a = (j.Answer || []).find((x: { type: number }) => x.type === 1);
      if (a) return { ip: a.data, ms: Math.round(performance.now() - start) };
      lastErr = new Error('No A record');
    } catch (e) {
      lastErr = e;
      if (e instanceof Error && e.message === 'NXDOMAIN') break;
    } finally {
      t.done();
    }
  }
  throw lastErr;
}

const geoCache = new Map<string, GeoInfo | undefined>();
async function geoLookup(ip: string): Promise<GeoInfo | undefined> {
  if (geoCache.has(ip)) return geoCache.get(ip);
  const t = withTimeout(7000);
  try {
    const r = await fetch(`https://ipwho.is/${ip}`, { signal: t.signal });
    const j = await r.json();
    if (j.success === false) throw new Error('fail');
    const g: GeoInfo = {
      country: j.country,
      countryCode: j.country_code,
      flag: flagFromCode(j.country_code),
      city: j.city || '',
      org: j.connection?.org || j.connection?.isp || '',
    };
    geoCache.set(ip, g);
    return g;
  } catch {
    return undefined;
  } finally {
    t.done();
  }
}

type Probe = { outcome: 'open' | 'answered' | 'timeout'; ms: number };

async function probe(target: string, port: number, timeoutMs = 5500): Promise<Probe> {
  const start = performance.now();
  const t = withTimeout(timeoutMs);
  const url = `https://${target}${port === 443 ? '' : ':' + port}/?_=${Date.now()}`;
  try {
    await fetch(url, { mode: 'no-cors', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: t.signal });
    return { outcome: 'open', ms: Math.round(performance.now() - start) };
  } catch {
    const ms = Math.round(performance.now() - start);
    return { outcome: ms >= timeoutMs - 50 ? 'timeout' : 'answered', ms };
  } finally {
    t.done();
  }
}

let onlineCache: { at: number; ok: boolean } | null = null;
async function phoneOnline(): Promise<boolean> {
  if (onlineCache && Date.now() - onlineCache.at < 15000) return onlineCache.ok;
  let ok = false;
  try {
    ok = (await NetProbe.connect({ host: '1.1.1.1', port: 443, timeout: 4000 })).outcome === 'open';
  } catch {
    ok = true; // cannot tell: don't blame the network
  }
  onlineCache = { at: Date.now(), ok };
  return ok;
}

async function testEndpointNative(ep: ParsedEndpoint): Promise<EndpointResult> {
  const base = { host: ep.host, port: ep.port, kind: ep.kind };
  const r = await NetProbe.connect({ host: ep.host, port: ep.port, timeout: 6000 });
  const geo = r.ip ? await geoLookup(r.ip) : undefined;
  if (r.outcome === 'open') {
    return { ...base, ip: r.ip, dnsMs: r.dnsMs, geo, latency: r.ms, status: 'working', detail: `Port ${ep.port} is open - connected in ${r.ms} ms` };
  }
  if (r.outcome === 'refused') {
    return { ...base, ip: r.ip, dnsMs: r.dnsMs, geo, latency: r.ms, status: 'likely', detail: `Host is online but TCP port ${ep.port} refused (normal for UDP / OpenVPN, or the port is closed)` };
  }
  if (!(await phoneOnline())) {
    return { ...base, ip: r.ip, geo, status: 'blocked', detail: 'Your phone has no working internet right now, so this could not be tested. Connect and test again.' };
  }
  if (r.outcome === 'dns') return { ...base, status: 'dead', detail: 'Domain does not resolve (DNS failed)' };
  return { ...base, ip: r.ip, dnsMs: r.dnsMs, geo, status: 'blocked', detail: r.outcome === 'timeout' ? 'No reply - blocked on your network or the server is offline' : 'Network unreachable for this server' };
}

export async function testEndpoint(ep: ParsedEndpoint): Promise<EndpointResult> {
  if (isNative()) {
    try {
      return await testEndpointNative(ep);
    } catch {
      /* plugin missing - fall back to the browser test below */
    }
  }
  const base = { host: ep.host, port: ep.port, kind: ep.kind };
  let ip = ep.isIp ? ep.host : '';
  let dnsMs: number | undefined;
  if (!ip) {
    try {
      const r = await resolveHost(ep.host);
      ip = r.ip;
      dnsMs = r.ms;
    } catch {
      return { ...base, status: 'dead', detail: 'Domain does not resolve (DNS failed)' };
    }
  }
  const [p, geo] = await Promise.all([probe(ep.host, ep.port), geoLookup(ip)]);
  if (p.outcome === 'open') {
    return { ...base, ip, dnsMs, geo, latency: p.ms, status: 'working', detail: `Server responded in ${p.ms} ms` };
  }
  if (p.outcome === 'answered') {
    // a very quick failure with a non-open port is still likely alive (TLS / protocol mismatch)
    return {
      ...base, ip, dnsMs, geo, latency: p.ms, status: 'likely',
      detail: `Host answered in ${p.ms} ms (not a web server, normal for VPN/SSH/proxy ports)`,
    };
  }
  return { ...base, ip, dnsMs, geo, status: 'blocked', detail: 'No reply – blocked or offline on your network' };
}

const rank: Record<EndpointStatus, number> = { working: 0, likely: 1, blocked: 2, dead: 3 };
const kindRank: Record<ParsedEndpoint['kind'], number> = { server: 0, proxy: 1, sni: 2, 'host-header': 3, found: 4 };

export async function testConfig(cfg: ParsedConfig, net: NetworkInfo | null, onProgress?: (r: EndpointResult) => void): Promise<ConfigResult> {
  const results: EndpointResult[] = [];
  const queue = [...cfg.endpoints];
  const worker = async () => {
    while (queue.length) {
      const ep = queue.shift()!;
      const r = await testEndpoint(ep);
      results.push(r);
      onProgress?.(r);
    }
  };
  await Promise.all([worker(), worker(), worker()]);

  results.sort((a, b) => rank[a.status] - rank[b.status] || kindRank[a.kind] - kindRank[b.kind] || (a.latency ?? 9e9) - (b.latency ?? 9e9));
  // judge by the real servers / proxies; SNI and Host-header names alone can't prove a config works
  const core = results.filter((r) => r.kind === 'server' || r.kind === 'proxy');
  const pool = core.length ? core : results;
  const best = pool[0];
  let verdict: Verdict = 'unreadable';
  if (results.length) {
    verdict = best.status === 'working' ? (core.length ? 'working' : 'likely') : best.status === 'likely' ? 'likely' : 'dead';
  }
  // location: prefer the main server's country
  const loc = results.find((r) => r.kind === 'server' && r.geo) || results.find((r) => r.geo);
  return {
    id: cfg.id,
    name: cfg.name,
    format: cfg.format,
    encrypted: cfg.encrypted,
    verdict,
    best,
    endpoints: results,
    testedAt: Date.now(),
    isp: net?.isp || 'Unknown',
    network: net?.ip || '',
    country: loc?.geo?.country,
    countryCode: loc?.geo?.countryCode,
    flag: loc?.geo?.flag,
  };
}
