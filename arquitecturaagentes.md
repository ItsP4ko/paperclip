# Arquitectura de Sistema de Agentes para Claude Code

Guía completa para entender y replicar el sistema de agentes en cualquier proyecto.

---

## 1. Estructura de carpetas

```
.claude/
├── agents/                    ← Agentes especializados (quién trabaja)
│   ├── [proyecto]-orchestrator.md    ← Punto de entrada único
│   ├── [proyecto]-backend.md
│   ├── [proyecto]-frontend.md
│   ├── [proyecto]-ux-ui.md
│   ├── [proyecto]-data-architect.md
│   ├── [proyecto]-security.md
│   ├── [proyecto]-qa.md
│   └── [proyecto]-performance.md
│
├── skills/                    ← Conocimiento técnico pasivo (libros de referencia)
│   ├── postgres-best-practices/
│   ├── react-best-practices/
│   ├── security-best-practices/
│   ├── senior-frontend/
│   ├── senior-backend/
│   ├── senior-architect/
│   ├── senior-security/
│   ├── senior-qa/
│   ├── database-design/
│   ├── ui-ux-pro-max/
│   ├── frontend-design/
│   ├── nextjs-best-practices/
│   ├── nextjs-supabase-auth/
│   ├── software-architecture/
│   ├── architecture/
│   ├── senior-prompt-engineer/
│   ├── ux-researcher-designer/
│   ├── vulnerability-scanner/
│   ├── top-web-vulnerabilities/
│   ├── sql-injection-testing/
│   └── brainstorming/
│
└── worktrees/                 ← Git worktrees (auto-managed)

resumenes/                     ← Fuente de verdad del proyecto (documentación viva)
├── database-resumen.md
├── frontend-resumen.md
├── auth-resumen.md
├── [modulo]-resumen.md
└── ...

CLAUDE.md                      ← Instrucciones del proyecto + referencia al sistema de agentes
```

---

## 2. Los tres pilares

```
┌─────────────────────────────────────────────────────┐
│                    CLAUDE.md                         │
│         Reglas del proyecto + mapa de agentes        │
└──────────────────────┬──────────────────────────────┘
                       │
        ┌──────────────┼──────────────────┐
        ▼              ▼                  ▼
┌──────────────┐ ┌───────────┐ ┌──────────────────┐
│   AGENTES    │ │  SKILLS   │ │   RESUMENES      │
│ Quién trabaja│ │ Cómo hacer│ │ Verdad del       │
│ (ejecutores) │ │ bien      │ │ proyecto         │
│              │ │ (pasivas) │ │ (documentación)  │
│ Conocen el   │ │ Se activan│ │ Los agentes la   │
│ proyecto     │ │ solas por │ │ consultan antes  │
│ Toman        │ │ pattern   │ │ de actuar y la   │
│ decisiones   │ │ matching  │ │ actualizan post  │
└──────────────┘ └───────────┘ └──────────────────┘
```

| Pilar | Qué es | Ejemplo |
|-------|--------|---------|
| **Agentes** | Ejecutores con contexto del proyecto | `gromo-backend` sabe que usás `getAuthenticatedTenant()`, schema public, tenant_id |
| **Skills** | Best practices técnicas genéricas | `postgres-best-practices` sabe que partial indexes mejoran RLS performance |
| **Resumenes** | Documentación viva de cada módulo | `stock-resumen.md` describe PMP, pendientes, RPCs, tipos, componentes |

---

## 3. Flujo de trabajo completo

```
USUARIO pide algo
       │
       ▼
┌─────────────────────┐
│  ORCHESTRATOR       │
│  1. Clasifica modo  │
│  2. Identifica capas│
│  3. Elige agentes   │
└────────┬────────────┘
         │
    ┌────┼────┐         (paralelo si son independientes)
    ▼    ▼    ▼
┌──────┐┌──────┐┌──────┐
│AGENT1││AGENT2││AGENT3│──→ Lee resumenes/ (verdad del proyecto)
│      ││      ││      │──→ Skills se inyectan automáticamente
│      ││      ││      │──→ Produce plan o código según modo
└──┬───┘└──┬───┘└──┬───┘
   │       │       │
   └───────┼───────┘
           ▼
┌─────────────────────┐
│  ORCHESTRATOR       │
│  Consolida          │
│  Presenta al usuario│
└────────┬────────────┘
         │
         ▼
    USUARIO decide
    "dale" → implementar
    "no" → replanificar
    "corregí X" → ajustar
         │
         ▼
   Post-implementación:
   Agente actualiza resumenes/[modulo]-resumen.md
```

---

## 4. Los 6 modos de operación

| Modo | Trigger | Qué pueden hacer los agentes | Requiere aprobación |
|------|---------|------------------------------|---------------------|
| 🔍 **LECTURA** | "explicame", "mostrá" | Solo leer | No |
| 📋 **PLANIFICACIÓN** | Feature nuevo (default) | Leer + producir plan | Sí, antes de ejecutar |
| ⚙️ **IMPLEMENTACIÓN** | "dale", "hacé" | Todo habilitado | Ya fue aprobado |
| 🔎 **REVISIÓN** | "reviewá", "está bien?" | Leer + feedback | No |
| 🐛 **DEBUG** | "no funciona", "bug" | Leer + diagnóstico | Sí, antes de fixear |
| 🔒 **AUDITORÍA** | "seguridad", "audit" | Leer + reporte | Sí, antes de fixear |

---

## 5. Anatomía de un agente

Cada archivo `.md` en `agents/` tiene esta estructura:

```markdown
---
name: [proyecto]-[rol]
description: "Descripción con ejemplos de uso.

<example>
  <context>Situación</context>
  <user>Lo que dice el usuario</user>
  <assistant>Lo que hace el agente</assistant>
</example>"
tools: Read, Write, Edit, Bash, Glob, Grep
model: sonnet
---

# Título

## Fuente de Verdad
→ Qué archivos de resumenes/ consultar

## Stack
→ Tecnologías específicas que maneja

## Patrones Críticos
→ Código de referencia del proyecto real

## Reglas
→ Lo que NUNCA y SIEMPRE debe hacer
```

**Claves para que funcione bien:**
- Los **examples** en la description le enseñan cuándo activarse
- La sección **Fuente de Verdad** lo obliga a leer antes de actuar
- Los **Patrones Críticos** le dan código real del proyecto (no genérico)
- Las **Reglas** son hard constraints que no puede romper

---

## 6. Cómo interactúan skills y agentes

```
[proyecto]-backend trabaja en una server action
       │
       │ edita un archivo .ts con queries de Supabase
       │
       ▼
┌─────────────────────────────────────┐
│  HOOKS (automáticos, pretooluse)    │
│  Detectan: "archivo .ts" + "query" │
│  Inyectan:                          │
│   • postgres-best-practices         │
│   • nextjs-best-practices           │
│   • senior-backend                  │
└─────────────────────────────────────┘
       │
       ▼
  El agente ahora tiene:
  ✅ Contexto del proyecto (resumenes/)
  ✅ Best practices de Postgres (skill)
  ✅ Patterns de Next.js (skill)
  → Produce código que es correcto para el proyecto Y técnicamente óptimo
```

Las skills se activan por **pattern matching** sobre el archivo o comando que se está ejecutando. Máximo 3 skills por invocación. Se inyectan una vez por sesión (no se repiten).

---

## 7. La carpeta resumenes/ — el secreto de que funcione

Sin esto, los agentes alucinan. Con esto, trabajan sobre la realidad.

**Qué tiene cada resumen:**
- Tablas y tipos del módulo
- Server actions con sus parámetros
- Componentes y hooks existentes
- Patrones específicos del módulo
- Edge cases y decisiones de diseño

**Regla de oro:** Cambio groso al módulo → el agente actualiza el resumen. Esto mantiene la documentación viva sin esfuerzo manual.

---

## 8. Reglas inamovibles (copiar a cualquier proyecto)

1. Sin "dale" no se implementa en modo PLANIFICACIÓN
2. Sin SQL aprobado no hay migración
3. Sin confirmación no se pushea a main
4. Siempre leer resumenes/ antes de actuar
5. Cambio groso = actualizar resumen del módulo
6. TypeScript estricto — `any` prohibido
7. Leer archivos reales antes de planificar o modificar
8. Cambios mínimos y focalizados — no agregar features no pedidas

---

## 9. Paso a paso para implementar en un proyecto nuevo

### Paso 1: Crear la carpeta de resumenes

Documentar cada módulo del proyecto en `resumenes/[modulo]-resumen.md`. Cada resumen debe incluir:

- Descripción del módulo (1-2 líneas)
- Tablas de BD involucradas (nombres, campos clave, relaciones)
- Server actions / API endpoints (nombre, parámetros, qué hacen)
- Componentes principales (nombre, props, dónde se usan)
- Hooks y stores (nombre, qué exponen)
- Tipos TypeScript relevantes
- Patrones específicos del módulo (cálculos, validaciones, edge cases)
- Decisiones de diseño importantes

**Tip:** Podés pedirle a Claude que genere los resumenes leyendo el código existente:
```
Leé el todas las lineas del codigo de cada módulo y de cada archivo del modulo src/modules/stock/ completo y generá resumenes/stock-resumen.md
con toda la info que un developer necesitaría para trabajar en este módulo.
```

### Paso 2: Instalar skills (conocimiento técnico genérico)

Elegir las skills relevantes para tu stack:

```bash
# Stack Next.js + React + Supabase/Postgres
npx claude-code-templates@latest --skill \
  development/senior-frontend,\
  development/senior-backend,\
  development/senior-architect,\
  development/senior-security,\
  development/senior-qa,\
  development/react-best-practices,\
  development/nextjs-best-practices,\
  development/postgres-best-practices,\
  development/database-design,\
  development/software-architecture,\
  development/architecture,\
  creative-design/ui-ux-pro-max,\
  creative-design/frontend-design,\
  creative-design/ux-researcher-designer,\
  security/security-best-practices
```

Agregar según el stack:
- Supabase auth: `development/nextjs-supabase-auth`
- Prompt engineering (si hay AI): `development/senior-prompt-engineer`
- Security extra: `security/sql-injection-testing`, `security/vulnerability-scanner`, `security/top-web-vulnerabilities`

### Paso 3: Instalar agentes template (fuente para fusionar)

```bash
npx claude-code-templates@latest --agent \
  development-team/backend-architect,\
  development-team/frontend-developer,\
  development-team/ui-ux-designer,\
  development-team/ui-designer,\
  database/database-architect,\
  database/database-optimizer,\
  security/penetration-tester,\
  web-tools/expert-react-frontend-engineer,\
  web-tools/expert-nextjs-developer,\
  web-tools/nextjs-architecture-expert,\
  ai-specialists/prompt-engineer,\
  expert-advisors/architect-review,\
  expert-advisors/documentation-expert,\
  deep-research-team/data-analyst,\
  realtime/supabase-realtime-optimizer
```

### Paso 4: Fusionar en 7 agentes + orquestador

Crear 8 archivos en `.claude/agents/` fusionando los templates con el contexto del proyecto:

| Agente a crear | Templates fuente |
|----------------|-----------------|
| `[proyecto]-orchestrator` | Estructura del orquestador + contexto proyecto |
| `[proyecto]-backend` | backend-architect + expert-nextjs-developer + nextjs-architecture-expert |
| `[proyecto]-frontend` | frontend-developer + expert-react-frontend-engineer |
| `[proyecto]-ux-ui` | ui-designer + ui-ux-designer |
| `[proyecto]-data-architect` | database-architect + database-optimizer + supabase-schema-architect + supabase-realtime-optimizer |
| `[proyecto]-security` | security-engineer + penetration-tester |
| `[proyecto]-qa` | code-reviewer + data-analyst |
| `[proyecto]-performance` | performance-engineer |

**Para cada agente:**
1. Leer los templates fuente y extraer lo mejor de cada uno
2. Reemplazar stack genérico por el stack real del proyecto
3. Agregar patrones de código reales (copiar ejemplos del código existente)
4. Apuntar la "Fuente de Verdad" a los archivos de `resumenes/` relevantes
5. Agregar la regla de actualizar resumenes post-cambio significativo
6. Agregar reglas inamovibles específicas del proyecto

**Tip:** Podés pedirle a Claude que haga la fusión:
```
Leé los agentes template en .claude/agents/ y los resumenes en resumenes/.
Creá 7 agentes específicos para [mi proyecto] + un orquestador,
fusionando los templates con el contexto real del proyecto.
Después borrá los templates originales.
```

### Paso 5: Borrar templates originales

```bash
# Borrar todos los agentes que no sean [proyecto]-* ni gsd-*
cd .claude/agents/
ls -1 | grep -v '^[proyecto]-' | grep -v '^gsd-' | xargs rm
```

### Paso 6: Configurar CLAUDE.md

Agregar al `CLAUDE.md` del proyecto:

```markdown
## Sistema de Agentes

Para tareas no triviales, usar el orquestador `[proyecto]-orchestrator`
como punto de entrada.

### Agentes disponibles
| Agente | Rol |
|--------|-----|
| `[proyecto]-orchestrator` | Coordinador central |
| `[proyecto]-backend` | Server actions, API, lógica de negocio |
| `[proyecto]-frontend` | Componentes, hooks, state management |
| `[proyecto]-ux-ui` | Diseño, accesibilidad, design system |
| `[proyecto]-data-architect` | Database, migraciones, RLS |
| `[proyecto]-security` | Seguridad, auditoría, auth |
| `[proyecto]-qa` | Testing, code review |
| `[proyecto]-performance` | Optimización, profiling |

### Fuente de verdad
Todos los agentes consultan `resumenes/` antes de actuar.
Cuando se hacen cambios significativos a un módulo,
actualizar `resumenes/[modulo]-resumen.md`.
```

### Paso 7: Iterar

- Los resumenes se enriquecen con cada tarea (los agentes los actualizan)
- Si un agente se equivoca repetidamente, ajustar sus reglas o patrones
- Si falta un resumen, crearlo antes de trabajar en ese módulo
- Revisar periódicamente que los resumenes estén actualizados

---

## 10. Checklist de implementación

- [ ] Carpeta `resumenes/` creada con un `.md` por módulo
- [ ] Skills instaladas (relevantes al stack)
- [ ] Templates de agentes instalados como fuente
- [ ] 7 agentes fusionados + orquestador creados
- [ ] Templates originales borrados
- [ ] `CLAUDE.md` actualizado con sección de agentes
- [ ] Reglas inamovibles definidas en el orquestador
- [ ] Fuente de verdad referenciada en cada agente
- [ ] Regla de actualizar resumenes incluida en cada agente

---

## 11. Agente especialista: `[proyecto]-agent-ai`

Este agente es **opcional pero necesario** cuando el proyecto incluye un chatbot AI conversacional (construido con AI SDK). No es parte del set de 8 agentes estándar — es un noveno agente que programa al propio agente AI del producto.

### Cuándo crearlo

Crear este agente si el proyecto tiene:
- Una API route `/api/chat` con `streamText()`
- Un módulo `agent/` con tools, prompts y document pipeline
- Un frontend con `useChat()` de AI SDK
- Lógica de extracción de documentos vía AI

### Templates a instalar

```bash
npx claude-code-templates@latest --agent \
  ai-specialists/prompt-engineer,\
  web-tools/nextjs-architecture-expert
```

El **prompt-engineer** aporta el conocimiento sobre diseño de prompts, few-shot examples, optimización de tokens y anti-alucinación. El **nextjs-architecture-expert** aporta el contexto de cómo integrar el agente en el App Router (API routes, streaming, server actions).

### Archivos clave que domina este agente

El agente-ai especialista trabaja principalmente sobre esta estructura:

```
src/modules/agent/
├── components/
│   ├── chat-panel.tsx           ← useChat + sheet lateral
│   └── chat-message.tsx         ← renderizado de .parts (AI SDK v6)
└── lib/
    ├── response-formatter.ts    ← query results → texto markdown legible
    ├── prompts/
    │   ├── system-prompt.ts     ← instrucciones del agente (cacheado)
    │   └── extraction-prompt.ts ← extracción de documentos (KEY=VALUE)
    └── tools/
        ├── tool-definitions.ts  ← createAgentTools() — todas las tools
        ├── shared-logic.ts      ← implementaciones (queries + registros)
        ├── document-processor.ts ← pipeline extract → commit
        ├── query-executor.ts    ← SQL read-only con tenant CTEs
        └── validate-url.ts      ← protección SSRF
```

### Lógica que debe tener este agente

El agente-ai especialista tiene **4 dominios de conocimiento** que no tiene ningún otro agente:

#### Dominio 1: Diseño de Tools

Sabe el ciclo completo para agregar una tool nueva al chatbot:

```
1. inputSchema Zod (con .describe() en cada campo — el LLM los lee)
2. execute implementada en shared-logic.ts (no inline)
3. Formateador en response-formatter.ts (si es consulta)
4. Documentación en system-prompt.ts (reglas de uso)
5. Tests: happy path + edge cases
6. Filtrar siempre por tenantId (seguridad multitenancy)
```

Patrón de referencia para una tool de consulta:

```typescript
consultarStock: tool({
  description: 'Consulta el stock actual de insumos',
  inputSchema: z.object({
    insumo: z.string().optional().describe('Nombre del insumo a filtrar'),
  }),
  execute: async ({ insumo }) => {
    const rows = await queryStock(tenantId, insumo)  // en shared-logic.ts
    return formatStockResults(rows)                   // en response-formatter.ts
  },
})
```

#### Dominio 2: Diseño de Prompts

Conoce los dos tipos de prompts del sistema y qué optimizar en cada uno:

| Prompt | Archivo | Qué optimizar |
|--------|---------|---------------|
| **System prompt** | `system-prompt.ts` | Reglas del agente, estilo de respuesta, cuándo usar cada tool, anti-alucinación, defensas contra prompt injection |
| **Extraction prompt** | `extraction-prompt.ts` | Formato KEY=VALUE por tipo de documento, niveles de confianza por campo, few-shot examples para casos edge |

Reglas que el system prompt siempre debe tener:
- Reportar resultado de herramientas al usuario (nunca silenciar)
- No mencionar nombres internos de tools al usuario
- Si no hay datos, decirlo — nunca inventar
- Resolver lenguaje natural ("ayer", "la semana pasada") antes de llamar tools

#### Dominio 3: Pipeline de Documentos

Entiende el flujo de 2 fases para procesar documentos adjuntos:

```
Archivo adjunto → /api/upload → URL Storage
  → tool guardarDoc(url)
    → FASE 1: extractAndPreviewDocument(url, tenantId)
        → AI extrae datos crudos (extraction-prompt)
        → Parser parsea KEY=VALUE por tipo de doc
        → Resolver matchea proveedor/entidad
        → Check de duplicados (hash, comprobante, proveedor+fecha+total)
        → Retorna preview para mostrar al usuario
    → FASE 2: commitParsedDocument(extracted, url, tenantId)
        → Ejecuta según tipo: factura, ODT, LPG, remito
        → Genera entradas en stock, servicios, aplicaciones
        → Persiste en BD
```

El único orden correcto es siempre fase 1 antes de fase 2 — nunca se commitea sin preview previo.

#### Dominio 4: Seguridad del Agente

Tiene en mente las vulnerabilidades específicas de un agente AI:

| Riesgo | Mitigación |
|--------|------------|
| Tenant leakage | Filtrar por `tenantId` en TODAS las queries |
| SQL injection via tool `consultarDatos` | Allowlist de tablas + CTE wrapping + prohibir DML/DDL |
| SSRF en tool `guardarDoc` | `validate-url.ts` con allowlist de dominios + bloqueo de IPs privadas |
| Prompt injection | Reglas explícitas en system prompt |
| Abuso de rate | Rate limit 20 req/min en `/api/chat` |
| Archivos maliciosos | Magic bytes check + límite de tamaño en `/api/upload` |

### Patrones AI SDK v6 que debe conocer

```typescript
// API Route — server
import { streamText, tool, stepCountIs } from 'ai'
const result = streamText({
  model: google('gemini-2.5-flash'),
  system: await getSystemPrompt(),
  messages,
  tools: createAgentTools(tenantId, opts),
  stopWhen: stepCountIs(5),
  maxTokens: 5500,
})
return result.toUIMessageStreamResponse()

// Cliente
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
const { messages, sendMessage, status } = useChat({
  transport: new DefaultChatTransport({ api: '/api/chat' }),
})
// messages usan .parts (NO .content)
// status: 'submitted' | 'streaming' | 'ready'
```

### Cómo fusionarlo para tu proyecto

1. Instalar templates `prompt-engineer` + `nextjs-architecture-expert`
2. Crear `.claude/agents/[proyecto]-agent-ai.md` fusionando ambos
3. Reemplazar stack genérico por el stack real (modelo, SDK version, nombres de tools)
4. Agregar como **Fuente de Verdad**: `resumenes/agent-resumen.md` + `resumenes/api-resumen.md` + `resumenes/database-resumen.md`
5. Agregar los 4 dominios (tools, prompts, pipeline, seguridad) con código real del proyecto
6. Incluir tabla de tools existentes para que sepa qué ya existe antes de agregar una nueva
7. Agregar al `CLAUDE.md` y al orquestador

**Tip:** Pedirle a Claude que genere el agente:
```
Leé .claude/agents/prompt-engineer.md, .claude/agents/nextjs-architecture-expert.md
y los archivos reales de src/modules/agent/lib/.
Fusionalos en un agente [proyecto]-agent-ai.md especializado en el chatbot AI de este proyecto,
con patrones de código reales (no genéricos), tabla de tools existentes, pipeline de documentos
y reglas de seguridad multitenancy.
```

### Ejemplos de cuándo se activa

```markdown
<example>
  <context>El usuario quiere que el agente consulte una entidad nueva</context>
  <user>Quiero que el agente pueda consultar los cheques por estado</user>
  <assistant>Leo resumenes/agent-resumen.md y resumenes/cheques-resumen.md.
  Diseño la tool consultarCheques con inputSchema Zod, implemento la query
  en shared-logic.ts con filtro por tenantId, agrego el formateador,
  y documento la tool en system-prompt.ts.</assistant>
</example>

<example>
  <context>El pipeline de documentos falla con un tipo específico</context>
  <user>Las ODTs manuscritas no extraen bien los ítems</user>
  <assistant>Modo DEBUG. Reviso extraction-prompt.ts (sección ODT),
  verifico document-processor.ts (pipeline extract → parse → resolve),
  ejecuto tests existentes, y diagnostico si el problema está
  en el prompt de extracción o en el parser KEY=VALUE.</assistant>
</example>

<example>
  <context>El system prompt está causando alucinaciones</context>
  <user>El agente inventa datos cuando no tiene información</user>
  <assistant>Analizo system-prompt.ts: identifico dónde faltan reglas anti-alucinación,
  agrego instrucciones explícitas "si no hay datos, decilo — nunca inventes",
  y agrego few-shot examples de respuesta correcta ante datos vacíos.</assistant>
</example>
```

### Checklist para `[proyecto]-agent-ai`

- [ ] Templates `prompt-engineer` + `nextjs-architecture-expert` instalados
- [ ] Agente creado fusionando ambos templates con código real del proyecto
- [ ] Fuente de Verdad apunta a `resumenes/agent-resumen.md` y `resumenes/api-resumen.md`
- [ ] Tabla de tools existentes incluida en el agente
- [ ] Los 4 dominios documentados con patrones reales (no genéricos)
- [ ] `agent-resumen.md` creado con arquitectura del pipeline y lista de tools
- [ ] Agente registrado en el orquestador y en `CLAUDE.md`
