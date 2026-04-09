import type { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";

export const SESSION_COOKIE = "rc_session";
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header.split(";").map((part) => {
      const idx = part.indexOf("=");
      if (idx === -1) return [part.trim(), ""];
      return [part.slice(0, idx).trim(), decodeURIComponent(part.slice(idx + 1).trim())];
    }),
  );
}

function makeSessionValue(pin: string): string {
  const ts = Date.now();
  const sig = crypto.createHmac("sha256", pin).update(String(ts)).digest("hex");
  return `${ts}.${sig}`;
}

export function validatePinSession(value: string, pin: string): boolean {
  try {
    const dot = value.indexOf(".");
    if (dot === -1) return false;
    const ts = Number(value.slice(0, dot));
    const sig = value.slice(dot + 1);
    if (!ts || Number.isNaN(ts)) return false;
    if (Date.now() - ts > SESSION_TTL_MS) return false;
    const expected = crypto.createHmac("sha256", pin).update(String(ts)).digest("hex");
    const sigBuf = Buffer.from(sig, "hex");
    const expBuf = Buffer.from(expected, "hex");
    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}

export function createRemotePinAuthMiddleware(
  pin: string,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    // The PIN validation endpoint is always accessible
    if (req.path === "/api/remote-pin-auth") return next();

    const cookies = parseCookies(req.headers.cookie);
    if (validatePinSession(cookies[SESSION_COOKIE] ?? "", pin)) return next();

    // API calls from unauthenticated clients get 401
    if (req.path.startsWith("/api/")) {
      res.status(401).json({ error: "Remote Control access requires PIN authentication" });
      return;
    }

    // Everything else: serve the PIN entry page.
    // Override the global helmet CSP — the PIN page uses inline <script> and <style>
    // which default-src 'none' would block, causing form to submit as GET instead of
    // running the fetch handler, creating an infinite redirect loop.
    res
      .status(200)
      .set("Content-Type", "text/html")
      .set(
        "Content-Security-Policy",
        "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'",
      )
      .end(PIN_ENTRY_HTML);
  };
}

export function createRemotePinAuthHandler(
  pin: string,
): (req: Request, res: Response) => void {
  return (req, res) => {
    const submitted = req.body?.pin;
    if (typeof submitted !== "string" || submitted.trim() !== pin) {
      res.status(401).json({ error: "Invalid PIN" });
      return;
    }
    const value = makeSessionValue(pin);
    res.setHeader(
      "Set-Cookie",
      `${SESSION_COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`,
    );
    res.json({ ok: true });
  };
}

const PIN_ENTRY_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Remote Control — Access</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#09090b;color:#fafafa;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:24px}
.card{background:#18181b;border:1px solid #27272a;border-radius:16px;padding:40px 32px;width:100%;max-width:360px;text-align:center}
.icon{font-size:40px;margin-bottom:16px}
h1{font-size:20px;font-weight:600;margin-bottom:8px}
p{font-size:13px;color:#a1a1aa;margin-bottom:28px;line-height:1.5}
input{width:100%;padding:14px 16px;border:1px solid #3f3f46;border-radius:10px;background:#27272a;color:#fafafa;font-size:28px;letter-spacing:10px;text-align:center;outline:none;margin-bottom:16px;transition:border-color .15s}
input:focus{border-color:#71717a}
button{width:100%;padding:13px;background:#fafafa;color:#09090b;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;transition:background .15s}
button:hover{background:#e4e4e7}
button:disabled{opacity:.5;cursor:default}
.error{color:#f87171;font-size:13px;margin-top:12px;display:none}
</style>
</head>
<body>
<div class="card">
  <div class="icon">🔒</div>
  <h1>Remote Control</h1>
  <p>Enter the 6-digit PIN shown in the Relay Control app on your Mac</p>
  <form id="f">
    <input type="text" id="pin" maxlength="6" placeholder="000000" inputmode="numeric" autocomplete="off" autofocus />
    <button type="submit" id="btn">Access</button>
    <div class="error" id="err">Invalid PIN. Please try again.</div>
  </form>
</div>
<script>
var f=document.getElementById('f'),btn=document.getElementById('btn'),err=document.getElementById('err'),pinEl=document.getElementById('pin');
f.onsubmit=async function(e){
  e.preventDefault();
  btn.disabled=true;btn.textContent='Checking...';err.style.display='none';
  try{
    var r=await fetch('/api/remote-pin-auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin:pinEl.value}),credentials:'include'});
    if(r.ok){window.location.href='/';}
    else{err.style.display='block';pinEl.value='';pinEl.focus();}
  }catch(ex){err.textContent='Connection error. Try again.';err.style.display='block';}
  btn.disabled=false;btn.textContent='Access';
};
</script>
</body>
</html>`;
