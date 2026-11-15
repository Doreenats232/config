export interface ParsedEndpoint {
  host: string;
  port: number;
  kind: 'server' | 'sni' | 'proxy' | 'host-header' | 'found';
  isIp: boolean;
}

export interface ParsedConfig {
  id: string;
  name: string;
  ext: string;
  size: number;
  format: string;
  encrypted: boolean;
  notes: string[];
  endpoints: ParsedEndpoint[];
}

const IPV4 = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g;
const DOMAIN = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,24})\b/gi;

// file-name-like suffixes that look like domains but aren't
const JUNK_TLDS = new Set([
  'json', 'txt', 'xml', 'png', 'jpg', 'jpeg', 'gif', 'js', 'css', 'html', 'htm', 'java', 'class',
  'so', 'dll', 'exe', 'zip', 'hat', 'ehi', 'ovpn', 'conf', 'cfg', 'ini', 'log', 'dat', 'bin', 'key',
  'pem', 'crt', 'cer', 'md', 'yml', 'yaml', 'svg', 'ttf', 'woff', 'mp3', 'mp4', 'apk', 'pdf', 'sh',
  'py', 'rb', 'lua', 'properties', 'plist', 'ico', 'webp', 'db', 'sqlite', 'tmp', 'bak', 'sys',
]);

const isIp = (s: string) => /^(?:\d{1,3}\.){3}\d{1,3}$/.test(s);
const isPrivateIp = (ip: string) =>
  /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|255\.)/.test(ip);

function cleanHost(h: string) {
  return h.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[\/?#].*$/, '').replace(/:\d+$/, '').replace(/\.$/, '');
}

function validHost(h: string) {
  if (!h || h.length > 253) return false;
  if (isIp(h)) return !isPrivateIp(h) && h.split('.').every((p) => Number(p) <= 255);
  if (h === 'localhost') return false;
  if (!/^[a-z0-9.-]+$/.test(h)) return false;
  const tld = h.split('.').pop() || '';
  if (JUNK_TLDS.has(tld)) return false;
  if (/^(schemas?|www\.w3|xmlns|example\.(com|org)|localhost)/.test(h)) return false;
  return h.includes('.');
}

function tryBase64(s: string): string | null {
  try {
    const t = s.trim().replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    if (t.length < 16 || !/^[A-Za-z0-9+/=]+$/.test(t)) return null;
    const bin = atob(t);
    let printable = 0;
    for (let i = 0; i < bin.length; i++) {
      const c = bin.charCodeAt(i);
      if ((c >= 32 && c < 127) || c === 10 || c === 13 || c === 9) printable++;
    }
    if (printable / bin.length > 0.9) return bin;
  } catch {
    /* not base64 */
  }
  return null;
}

function printableStrings(bytes: Uint8Array): string {
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i];
    if (c >= 32 && c < 127) cur += String.fromCharCode(c);
    else {
      if (cur.length >= 4) out.push(cur);
      cur = '';
    }
  }
  if (cur.length >= 4) out.push(cur);
  return out.join('\n');
}

function nonPrintableRatio(bytes: Uint8Array) {
  const n = Math.min(bytes.length, 4000);
  if (!n) return 0;
  let bad = 0;
  for (let i = 0; i < n; i++) {
    const c = bytes[i];
    if (!(c === 9 || c === 10 || c === 13 || (c >= 32 && c < 127) || c >= 128)) bad++;
    if (c >= 128) bad += 0.5;
  }
  return bad / n;
}

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

interface Collector {
  list: ParsedEndpoint[];
  add: (host: string, port: number, kind: ParsedEndpoint['kind']) => void;
}

function collector(): Collector {
  const list: ParsedEndpoint[] = [];
  return {
    list,
    add(host, port, kind) {
      const h = cleanHost(host);
      if (!validHost(h)) return;
      const p = port > 0 && port < 65536 ? port : 443;
      const existing = list.find((e) => e.host === h);
      if (existing) {
        // prefer explicit server over generic finds
        if (existing.kind === 'found' && kind !== 'found') {
          existing.kind = kind;
          existing.port = p;
        }
        return;
      }
      list.push({ host: h, port: p, kind, isIp: isIp(h) });
    },
  };
}

function parseLinks(text: string, c: Collector, notes: string[]): string | null {
  let format: string | null = null;
  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    const m = line.match(/^(vmess|vless|trojan|ss|ssr|hysteria2?|hy2|tuic|wireguard):\/\/(.+)$/i);
    if (!m) continue;
    const scheme = m[1].toLowerCase();
    format = `${scheme.toUpperCase()} link`;
    try {
      if (scheme === 'vmess') {
        const json = tryBase64(m[2]);
        if (json) {
          const o = JSON.parse(json);
          if (o.add) c.add(String(o.add), Number(o.port) || 443, 'server');
          if (o.sni) c.add(String(o.sni), 443, 'sni');
          if (o.host) String(o.host).split(',').forEach((h: string) => c.add(h, 443, 'host-header'));
        }
      } else {
        let body = m[2];
        if (scheme === 'ss' && !body.includes('@')) {
          const dec = tryBase64(body.split('#')[0]);
          if (dec) body = dec;
        }
        const u = new URL(`x://${body.includes('@') ? body : 'u@' + body}`);
        if (u.hostname) c.add(u.hostname, Number(u.port) || 443, 'server');
        const sni = u.searchParams.get('sni') || u.searchParams.get('peer');
        if (sni) c.add(sni, 443, 'sni');
        const host = u.searchParams.get('host');
        if (host) c.add(host, 443, 'host-header');
      }
    } catch {
      /* ignore bad link */
    }
  }
  if (format) notes.push('Share links found – servers extracted directly.');
  return format;
}

function parseOvpn(text: string, c: Collector) {
  for (const m of text.matchAll(/^\s*remote\s+(\S+)\s*(\d+)?/gim)) c.add(m[1], Number(m[2]) || 1194, 'server');
  for (const m of text.matchAll(/^\s*(?:http-proxy|socks-proxy)\s+(\S+)\s+(\d+)/gim)) c.add(m[1], Number(m[2]), 'proxy');
  for (const m of text.matchAll(/^\s*(?:Host|X-Online-Host)\s*:\s*([^\s\\\r\n]+)/gim)) c.add(m[1], 443, 'host-header');
}

function walkJson(o: unknown, c: Collector, depth = 0) {
  if (depth > 8 || o == null) return;
  if (Array.isArray(o)) return o.forEach((x) => walkJson(x, c, depth + 1));
  if (typeof o !== 'object') return;
  const rec = o as Record<string, unknown>;
  const portOf = () => {
    const p = rec.port ?? rec.server_port ?? rec.serverPort ?? rec.sshPort ?? rec.ssh_port ?? rec.proxyPort;
    return Number(p) || 443;
  };
  for (const [k, v] of Object.entries(rec)) {
    const key = k.toLowerCase();
    if (typeof v === 'string') {
      if (/^(server|host|hostname|address|ip|remote|sshhost|ssh_host|serveraddr|domain|addr)$/.test(key)) c.add(v, portOf(), 'server');
      else if (/sni|servername|server_name|tlshost|bughost|bug_host/.test(key)) c.add(v, 443, 'sni');
      else if (/proxy(host|ip|addr)?$|proxyserver/.test(key)) c.add(v, Number(rec.proxyPort) || 8080, 'proxy');
      else if (/payload|header|requesthost|hostheader/.test(key)) {
        for (const m of v.matchAll(/Host:\s*([^\s\\r\\n\[\]]+)/gi)) c.add(m[1], 443, 'host-header');
      }
    } else walkJson(v, c, depth + 1);
  }
}

function genericScan(text: string, c: Collector) {
  for (const m of text.matchAll(/([a-z0-9.-]+\.[a-z]{2,24}|(?:\d{1,3}\.){3}\d{1,3}):(\d{2,5})\b/gi)) c.add(m[1], Number(m[2]), 'found');
  for (const m of text.matchAll(/Host:\s*([^\s\\\r\n\[\]]+)/gi)) c.add(m[1], 443, 'host-header');
  for (const m of text.matchAll(IPV4)) c.add(m[0], 443, 'found');
  for (const m of text.matchAll(DOMAIN)) c.add(m[0], 443, 'found');
}

export async function parseFile(file: File): Promise<ParsedConfig> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const notes: string[] = [];
  const c = collector();
  let format = ext ? `.${ext} file` : 'Config file';
  let encrypted = false;

  const ratio = nonPrintableRatio(buf);
  let text = new TextDecoder('utf-8', { fatal: false }).decode(buf);

  if (ratio > 0.12) {
    encrypted = true;
    text = printableStrings(buf);
    notes.push('File is binary or encrypted. Only readable text inside it was scanned.');
  } else {
    // maybe the whole file is base64
    const dec = tryBase64(text);
    if (dec) {
      text = dec;
      notes.push('Decoded Base64 content.');
    }
  }

  const linkFormat = parseLinks(text, c, notes);
  if (linkFormat) format = linkFormat;

  if (/^\s*(client|remote|dev|proto)\b/im.test(text) && /^\s*remote\s+/im.test(text)) {
    format = 'OpenVPN';
    parseOvpn(text, c);
  }

  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      walkJson(JSON.parse(trimmed), c);
      if (!linkFormat) format = ext === 'ehi' ? 'HTTP Injector (JSON)' : `${format.startsWith('.') ? 'JSON' : format} / JSON`;
    } catch {
      /* not valid json */
    }
  }

  const nameFormats: Record<string, string> = {
    hat: 'HA Tunnel',
    ehi: 'HTTP Injector',
    nm: 'NetMod',
    npv4: 'NapsternetV',
    npvt: 'NapsternetV',
    inpv: 'InjectorNPV',
    tnl: 'Tunnel config',
    sks: 'SocksIP',
    dark: 'Dark Tunnel',
    ziv: 'ZIVPN',
    vpn: 'VPN config',
    ovpn: 'OpenVPN',
    conf: 'WireGuard / generic conf',
    json: 'JSON config (V2Ray/Xray/sing-box)',
    txt: 'Text config',
  };
  if (nameFormats[ext] && (format.startsWith('.') || format === 'Config file' || format.startsWith('JSON'))) format = nameFormats[ext];

  // fallback broad scan
  if (c.list.length === 0 || encrypted || (format !== 'OpenVPN' && !linkFormat)) genericScan(text, c);

  if (c.list.length === 0) {
    notes.push(
      encrypted
        ? 'This file is locked/encrypted by its app, so servers cannot be read here. Use “Quick test” to enter the host manually, or export it unlocked from the app.'
        : 'No servers or hosts were found in this file.',
    );
  } else if (encrypted) {
    notes.push('Hosts found inside encrypted files may be incomplete – treat results as hints.');
  }

  // sort: servers first
  const order = { server: 0, proxy: 1, sni: 2, 'host-header': 3, found: 4 } as const;
  const endpoints = c.list.sort((a, b) => order[a.kind] - order[b.kind]).slice(0, 12);

  return { id: uid(), name: file.name, ext, size: file.size, format, encrypted, notes, endpoints };
}

export function parseText(text: string, name = 'Pasted text'): ParsedConfig {
  const c = collector();
  const notes: string[] = [];
  let format = 'Pasted text';
  const lf = parseLinks(text, c, notes);
  if (lf) format = lf;
  if (/^\s*remote\s+/im.test(text)) {
    parseOvpn(text, c);
    format = 'OpenVPN';
  }
  const t = text.trim();
  if (t.startsWith('{') || t.startsWith('[')) {
    try {
      walkJson(JSON.parse(t), c);
    } catch {
      /* ignore */
    }
  }
  genericScan(text, c);
  if (c.list.length === 0) notes.push('No hosts or IPs found in that text.');
  const order = { server: 0, proxy: 1, sni: 2, 'host-header': 3, found: 4 } as const;
  const endpoints = c.list.sort((a, b) => order[a.kind] - order[b.kind]).slice(0, 12);
  return { id: uid(), name, ext: 'txt', size: text.length, format, encrypted: false, notes, endpoints };
}
