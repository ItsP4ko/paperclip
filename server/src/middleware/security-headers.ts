import helmet from "helmet";

export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],
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
