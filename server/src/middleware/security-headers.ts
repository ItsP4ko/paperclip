import helmet from "helmet";

export function createSecurityHeaders(opts: { viteDev?: boolean } = {}) {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        ...(opts.viteDev
          ? {
              scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", "data:", "blob:"],
              fontSrc: ["'self'", "data:"],
              workerSrc: ["'self'", "blob:"],
              connectSrc: ["'self'", "ws:", "wss:"],
              manifestSrc: ["'self'"],
            }
          : {}),
      },
    },
    frameguard: {
      action: "deny",
    },
    strictTransportSecurity: {
      maxAge: 31_536_000,
      includeSubDomains: false,
    },
  });
}

export const securityHeaders = createSecurityHeaders();
