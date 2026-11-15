import { registerPlugin } from '@capacitor/core';

export interface ProbeResult {
  outcome: 'open' | 'refused' | 'unreachable' | 'timeout' | 'dns' | 'error';
  ms: number;
  ip?: string;
  dnsMs?: number;
  error?: string;
}

interface NetProbePlugin {
  connect(o: { host: string; port: number; timeout?: number }): Promise<ProbeResult>;
}

/** Native TCP probe (Android APK only). */
export const NetProbe = registerPlugin<NetProbePlugin>('NetProbe');
