# Requirements: Human Agents for Paperclip

**Defined:** 2026-04-05
**Milestone:** v1.3 Security Hardening
**Core Value:** Un humano puede recibir, trabajar y completar tareas dentro de Paperclip exactamente como lo hace un agente de IA — sin friccion, desde la web app.

## v1.3 Requirements

Requirements for v1.3 Security Hardening. Each maps to roadmap phases.

### Auth Hardening

- [x] **AUTH-01**: El endpoint de login tiene rate limit por IP (hard 429 after 10 attempts per 15-minute window) con Redis — montado antes del BetterAuth handler. _Updated 2026-04-06: changed from "progressive delay, no hard lockout" to hard 429. Research confirmed `express-slow-down` is not installed and `express-rate-limit` (already installed) provides the proven pattern. Phase success criterion specifies hard rate limit._
- [x] **AUTH-02**: Usuario puede ver lista de sesiones activas (dispositivo, navegador, IP, fecha) en Account Settings
- [x] **AUTH-03**: Usuario puede revocar una sesion individual desde Account Settings
- [x] **AUTH-04**: Usuario puede revocar todas las sesiones excepto la actual con un boton
- [x] **AUTH-05**: El token de sesion WS (`?token=`) es redactado de los access logs de pino

### API Hardening

- [ ] **API-01**: Todas las rutas mutation sin validacion tienen esquemas Zod (`validate()` middleware)
- [ ] **API-02**: GET routes con query params relevantes tienen `validateQuery()` con `z.coerce.*`
- [x] **API-03**: Respuestas 5xx en produccion no exponen stack traces ni detalles internos del servidor
- [x] **API-04**: La decision de no implementar CSRF esta documentada en codigo con justificacion tecnica

### Frontend / XSS

- [ ] **CSP-01**: `Content-Security-Policy-Report-Only` desplegado en `vercel.json` cubriendo el SPA
- [ ] **CSP-02**: CSP promovido a enforcing tras periodo de observacion limpio (48-72h sin violaciones)
- [ ] **CSP-03**: `dompurify` instalado en UI package y aplicado en todos los sitios con `dangerouslySetInnerHTML`

### Audit Logs

- [ ] **AUDIT-01**: Rutas de timeline y filters del audit log requieren `assertOwner` (solo owner puede acceder)
- [ ] **AUDIT-02**: `AuditLog.tsx` muestra estado 403 graceful para usuarios no-owner

## Future Requirements

Deferred to future milestones. Tracked but not in current roadmap.

### Auth

- **AUTH-F01**: Sesiones con geolocalizacion por IP
- **AUTH-F02**: Alertas por email en logins desde dispositivos desconocidos

### Audit Logs

- **AUDIT-F01**: Instrumentacion de eventos de seguridad (login success/fail, session revoke, invite, role change, assignment)
- **AUDIT-F02**: Export CSV de audit logs filtrados (streaming, solo owner)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| CSRF protection | Bearer token architecture es immune por diseno (OWASP confirmado). Anadirlo romperia mobile clients y AI agents con cero beneficio de seguridad |
| Hard account lockout | Crea vector DoS donde un attacker puede lockear cualquier cuenta. OWASP prefiere progressive delays con Redis TTL |
| Row-Level Security (RLS) | Deferred per PROJECT.md — single-tenant testing phase |
| Cloudflare Pages migration | Considerado para compatibilidad en este milestone, migracion en futuro |
| Notificaciones push/email de seguridad | Requiere infraestructura de email, out of scope |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 15 | Complete |
| AUTH-02 | Phase 15 | Complete |
| AUTH-03 | Phase 15 | Complete |
| AUTH-04 | Phase 15 | Complete |
| AUTH-05 | Phase 15 | Complete |
| API-01 | Phase 16 | Pending |
| API-02 | Phase 16 | Pending |
| API-03 | Phase 16 | Complete |
| API-04 | Phase 16 | Complete |
| CSP-01 | Phase 17 | Pending |
| CSP-02 | Phase 17 | Pending |
| CSP-03 | Phase 17 | Pending |
| AUDIT-01 | Phase 18 | Pending |
| AUDIT-02 | Phase 18 | Pending |

**Coverage:**
- v1.3 requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0

---
*Requirements defined: 2026-04-05*
*Last updated: 2026-04-06 — AUTH-01 updated from progressive delay to hard 429 per research findings*
