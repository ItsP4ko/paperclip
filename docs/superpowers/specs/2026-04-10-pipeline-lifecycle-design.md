# Pipeline Lifecycle Simplificado

## Goal
Simplificar el lifecycle del pipeline a 3 estados lineales: draft → running → completed. Sin re-runs, sin edición post-run, sin duplicación.

## Estados

### Draft
- Pipeline recién creado, editable
- Canvas completo: drag, connect, add/delete steps, side panel
- Header: nombre del pipeline + botón Run
- Run valida: todos los steps tienen assignee, todos conectados
- Al hacer Run: pipeline.status cambia a "running"

### Running
- Canvas locked: no drag, no connect, no delete, no side panel
- Nodes muestran status rings (blue=running, green=completed, red=failed, dim=skipped)
- Steps user-assigned running muestran checkmark verde
- Edges: smoothstep con color visible (#6b7280)
- Header: nombre + badge "Running" + contador "2/5 completed"
- Toolbar (+ Action, If/Else, Auto-layout) oculto
- Polling 3s en el run activo

### Completed
- NO muestra canvas — muestra panel de métricas
- Métricas:
  - Steps totales / completados
  - Tiempo total del run (startedAt → completedAt)
  - Tiempo promedio por step
  - Lista de steps: nombre, assignee, duración individual
- Header: nombre + badge "Completed"
- No hay botón de re-run ni editar
- Back button vuelve a /pipelines

## Transiciones
```
draft → running   (usuario hace click en Run)
running → completed  (evaluateReadySteps detecta todos los steps terminales)
```
No hay transiciones inversas. Un pipeline completado es inmutable.

## Cambios

### Backend (`server/src/services/pipelines.ts`)
- `triggerRun`: después de crear el run, actualizar `pipeline.status = "running"`
- `evaluateReadySteps`: cuando detecta `allTerminal`, además de marcar el run como completed, actualizar `pipeline.status = "completed"`

### Frontend (`ui/src/pages/PipelineDetail.tsx`)
- Renderizar 3 vistas basadas en `pipeline.status`:
  - `draft`: canvas editor (existente)
  - `running`: canvas locked con run overlay (existente)
  - `completed`: nuevo componente de métricas
- Remover cualquier lógica de redirect a run detail
- Run button solo visible en draft

### Frontend — Componente de métricas
- Nuevo componente `PipelineMetrics` (o inline en PipelineDetail)
- Recibe el run detail (último run completado)
- Muestra cards con: total steps, completed, tiempo total, tiempo promedio
- Tabla simple de steps: nombre, assignee, status, duración

### Pipeline list (`ui/src/pages/Pipelines.tsx`)
- Badge de status (draft/running/completed) ya existe
- Botón Run en la lista: solo para draft
- Click en pipeline completed: va a la vista de métricas

### DB
- No se necesitan migraciones — `pipeline.status` ya existe como campo string
- Solo cambiar los valores que se usan: "draft" → "running" → "completed"
