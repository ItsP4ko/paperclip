# Requirements: Human Agents for Paperclip

**Defined:** 2026-04-05
**Milestone:** v1.3 Security Hardening
**Core Value:** Un humano puede recibir, trabajar y completar tareas dentro de Paperclip exactamente como lo hace un agente de IA — sin fricción, desde la web app.

## v1.3 Requirements

Requirements for v1.3 Security Hardening. Each maps to roadmap phases.

### Auth Hardening

- [ ] **AUTH-01**: El endpoint de login tiene rate limit por IP (progressive delay, no hard lockout) con Redis — montado antes del BetterAuth handler
- [ ] **AUTH-02**: Usuario puede ver lista de sesiones activas (dispositivo, navegador, IP, fecha) en Account Settings
- [ ] **AUTH-03**: Usuario puede revocar una sesión individual desde Account Settings
- [ ] **AUTH-04**: Usuario puede revocar todas las sesiones excepto la actual con un botón
- [ ] **AUTH-05**: El token de sesión WS (`?token=`) es redactado de los access logs de pino

### API Hardening

- [ ] **API-01**: Todas las rutas mutation sin validación tienen esquemas Zod (`validate()` middleware)
- [ ] **API-02**: GET routes con query params relevantes tienen `validateQuery()` con `z.coerce.*`
- [ ] **API-03**: Respuestas 5xx en producción no exponen stack traces ni detalles internos del servidor
- [ ] **API-04**: La decisión de no implementar CSRF está documentada en código con justificación técnica

### Frontend / XSS

- [ ] **CSP-01**: `Content-Security-Policy-Report-Only` desplegado en `vercel.json` cubriendo el SPA
- [ ] **CSP-02**: CSP promovido a enforcing tras período de observación limpio (48-72h sin violaciones)
- [ ] **CSP-03**: `dompurify` instalado en UI package y aplicado en todos los sitios con `dangerouslySetInnerHTML`

### Audit Logs

- [ ] **AUDIT-01**: Rutas de timeline y filters del audit log requieren `assertOwner` (solo owner puede acceder)
- [ ] **AUDIT-02**: `AuditLog.tsx` muestra estado 403 graceful para usuarios no-owner

## Future Requirements

Deferred to future milestones. Tracked but not in current roadmap.

### Auth

- **AUTH-F01**: Sesiones con geolocalización por IP
- **AUTH-F02**: Alertas por email en logins desde dispositivos desconocidos

### Audit Logs

- **AUDIT-F01**: Instrumentación de eventos de seguridad (login success/fail, session revoke, invite, role change, assignment)
- **AUDIT-F02**: Export CSV de audit logs filtrados (streaming, solo owner)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| CSRF protection | Bearer token architecture es immune por diseño (OWASP confirmado). Añadirlo rompería mobile clients y AI agents con cero beneficio de seguridad |
| Hard account lockout | Crea vector DoS donde un attacker puede lockear cualquier cuenta. OWASP prefiere progressive delays con Redis TTL |
| Row-Level Security (RLS) | Deferred per PROJECT.md — single-tenant testing phase |
| Cloudflare Pages migration | Considerado para compatibilidad en este milestone, migración en futuro |
| Notificaciones push/email de seguridad | Requiere infraestructura de email, out of scope |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | — | Pending |
| AUTH-02 | — | Pending |
| AUTH-03 | — | Pending |
| AUTH-04 | — | Pending |
| AUTH-05 | — | Pending |
| API-01 | — | Pending |
| API-02 | — | Pending |
| API-03 | — | Pending |
| API-04 | — | Pending |
| CSP-01 | — | Pending |
| CSP-02 | — | Pending |
| CSP-03 | — | Pending |
| AUDIT-01 | — | Pending |
| AUDIT-02 | — | Pending |

**Coverage:**
- v1.3 requirements: 14 total
- Mapped to phases: 0
- Unmapped: 14 ⚠️

---
*Requirements defined: 2026-04-05*
*Last updated: 2026-04-05 after initial definition*
