package com.configtester.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.net.ConnectException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;

/** Real TCP reachability test using the phone's own DNS and network (no browser CORS/TLS limits). */
@CapacitorPlugin(name = "NetProbe")
public class NetProbePlugin extends Plugin {

    @PluginMethod
    public void connect(final PluginCall call) {
        final String host = call.getString("host", "");
        final Integer portObj = call.getInt("port", 443);
        final Integer timeoutObj = call.getInt("timeout", 6000);
        final int port = portObj == null ? 443 : portObj;
        final int timeout = timeoutObj == null ? 6000 : timeoutObj;

        new Thread(new Runnable() {
            @Override
            public void run() {
                JSObject out = new JSObject();
                long t0 = System.nanoTime();
                try {
                    InetAddress addr = InetAddress.getByName(host);
                    out.put("ip", addr.getHostAddress());
                    out.put("dnsMs", (System.nanoTime() - t0) / 1000000L);
                    long t1 = System.nanoTime();
                    Socket s = new Socket();
                    try {
                        s.connect(new InetSocketAddress(addr, port), timeout);
                        out.put("outcome", "open");
                    } finally {
                        try { s.close(); } catch (Exception ignored) { }
                    }
                    out.put("ms", (System.nanoTime() - t1) / 1000000L);
                } catch (UnknownHostException e) {
                    out.put("outcome", "dns");
                    out.put("ms", (System.nanoTime() - t0) / 1000000L);
                } catch (SocketTimeoutException e) {
                    out.put("outcome", "timeout");
                    out.put("ms", (System.nanoTime() - t0) / 1000000L);
                } catch (ConnectException e) {
                    String m = String.valueOf(e.getMessage()).toLowerCase();
                    out.put("outcome", m.contains("refused") ? "refused" : "unreachable");
                    out.put("ms", (System.nanoTime() - t0) / 1000000L);
                } catch (Exception e) {
                    out.put("outcome", "error");
                    out.put("error", String.valueOf(e.getMessage()));
                    out.put("ms", (System.nanoTime() - t0) / 1000000L);
                }
                call.resolve(out);
            }
        }).start();
    }
}
