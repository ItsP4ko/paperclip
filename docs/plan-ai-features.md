# Plan de Implementación — HittManager AI Features

## Resumen ejecutivo

Se agregan 5 features al sistema de gestión de proyectos:
1. Generación de tareas desde documentos (Gemini)
2. Historias de usuario como subtareas dentro de cada tarea
3. Info Proyecto como contexto para el asistente
4. Biblioteca de documentos por proyecto
5. Storage de archivos en Supabase

---

## Feature 1 — Generar tareas desde documento

### Descripción
El usuario puede subir un documento (PDF, DOCX, TXT, MD) dentro de la
vista de issues de un proyecto. Gemini 2.5 Flash Lite analiza el documento
y extrae tareas de desarrollo. Antes de crearlas, el usuario ve un popup
de preview donde puede editar, deseleccionar o cambiar la prioridad de
cada tarea.

### UX / Flujo
1. En la vista Issues de un proyecto aparece el botón "Generar desde documento"
2. El usuario hace click o arrastra un archivo sobre la zona de drop
3. Mientras Gemini analiza se muestra un loader con el nombre del archivo
4. Se abre el dialog de preview con las tareas generadas
5. El usuario puede:
   - Seleccionar / deseleccionar cada tarea con un checkbox
   - Editar el título inline
   - Expandir para ver/editar la descripción (markdown)
   - Cambiar la prioridad (critical / high / medium / low)
   - Seleccionar todas / deseleccionar todas
6. Al confirmar, se crean todas las tareas seleccionadas en el proyecto
7. El dialog se cierra y la lista de issues se refresca

### Formatos soportados
| Formato | MIME type | Cómo lo procesa Gemini |
|---------|-----------|------------------------|
| PDF | application/pdf | Inline base64 |
| DOCX | application/vnd.openxmlformats-officedocument.wordprocessingml.document | Gemini File API |
| TXT | text/plain | Texto inline |
| MD | text/markdown | Texto inline |

### Límites
- Tamaño máximo: 20 MB
- Tareas generadas: entre 3 y 15
- Título de tarea: máximo 120 caracteres

### API (server)
```
POST /companies/:companyId/analyze-document
Content-Type: multipart/form-data
Body: file (File)

Response 200:
{
  tasks: [
    {
      title: string,
      description: string (markdown),
      priority: "low" | "medium" | "high" | "critical"
    }
  ]
}
```

---

## Feature 2 — Historias de usuario como subtareas

### Descripción
Dentro del detalle de cada issue, el usuario puede generar historias de
usuario que se crean como subtareas de esa tarea. Gemini usa el título y
descripción de la tarea junto con la Info Proyecto del proyecto al que
pertenece la tarea para generar historias contextualizadas.

### UX / Flujo
1. El usuario primero crea las tareas desde un documento (Feature 1)
2. Entra al detalle de una tarea
3. Dentro del detalle aparece el botón "Generar historias de usuario"
4. Al hacer click, el servidor obtiene la Info Proyecto del proyecto asociado
5. Gemini genera entre 3 y 5 historias de usuario
6. Se abre un dialog de preview con las historias
7. Cada historia muestra:
   - Título en formato: "Como [usuario], quiero [acción] para [beneficio]"
   - Criterios de aceptación en formato bullet list markdown
8. El usuario puede seleccionar / deseleccionar cada historia
9. Al confirmar, se crean como subtareas con:
   - parentId = id del issue actual
   - status = "backlog"
   - priority = heredada del issue padre

### Contexto que recibe Gemini
```
Info del Proyecto:
{contenido de ai_context del proyecto — definido en Info Proyecto}

Tarea:
Título: {issue.title}
Descripción: {issue.description}

Generá 3 a 5 historias de usuario...
```

### API (server)
```
POST /issues/:id/generate-user-stories

Response 200:
{
  userStories: [
    {
      title: string,       // "Como X, quiero Y para Z"
      description: string  // criterios de aceptación en markdown
    }
  ]
}
```

---

## Feature 3 — Info Proyecto (contexto para el asistente)

### Descripción
Cada proyecto tiene una sección editable en markdown llamada "Info Proyecto"
que actúa como contexto persistente para el asistente. Gemini la usa
automáticamente al generar historias de usuario. El usuario la puede editar
en cualquier momento desde el tab Overview del proyecto.

### Contenido sugerido
- Stack tecnológico del proyecto
- Tipos de usuarios del sistema (admin, operador, cliente, etc.)
- Reglas de negocio relevantes
- Convenciones del equipo
- Glosario de términos del dominio

### UX
- Sección colapsable en el tab Overview del proyecto
- Título: "Info Proyecto"
- Editor markdown (mismo componente InlineEditor que usa el resto de la app)
- Auto-guardado con debounce de 800ms
- Indicador de estado: guardando / guardado

### Almacenamiento
- Nueva columna `ai_context` (text, nullable) en la tabla `projects`
- Migración de Drizzle ORM

### API (server)
```
GET  /projects/:id/ai-context
Response: { content: string }

PUT  /projects/:id/ai-context
Body: { content: string }
Response: { content: string }
```

---

## Feature 4 — Biblioteca de documentos por proyecto

### Descripción
Una nueva tab "Biblioteca" en la página de cada proyecto que centraliza
todos los archivos adjuntos de todos los issues del proyecto. Los archivos
están organizados en carpetas, donde cada carpeta corresponde a una tarjeta
y lleva el título de esa tarjeta.

### UX / Estructura
```
Biblioteca
├── 🔍 Buscador (por nombre de archivo o título de tarjeta)
├── 📁 [Título de tarjeta 1] — PAC-34 — 3 archivos
│   ├── 📄 especificacion.pdf — 1.2 MB — [↓ descargar]
│   ├── 🖼️ mockup-home.png — 340 KB — [↓ descargar]
│   └── 📄 notas.txt — 4 KB — [↓ descargar]
├── 📁 [Título de tarjeta 2] — PAC-31 — 1 archivo
│   └── 📄 requerimientos.docx — 900 KB — [↓ descargar]
└── ...
```

### Comportamiento
- Las carpetas son colapsables (abiertas por defecto)
- Solo aparecen tarjetas que tengan al menos un archivo adjunto
- La búsqueda filtra tanto por nombre de archivo como por título de tarjeta
- Los archivos se descargan via signed URL de Supabase (válida 1 hora)
- Si no hay archivos: empty state con instrucciones

### API (server)
```
GET /companies/:companyId/projects/:projectId/library

Response 200:
{
  folders: [
    {
      issueId: string,
      issueTitle: string,
      issueIdentifier: string | null,
      issueStatus: string,
      attachments: [
        {
          id: string,
          originalFilename: string | null,
          contentType: string,
          byteSize: number,
          contentPath: string,  // signed URL de Supabase
          createdAt: string
        }
      ]
    }
  ]
}
```

### Navegación
- Nueva tab "Biblioteca" en ProjectDetail entre "Workspaces" y "Configuration"
- Ruta: `/projects/:projectId/library`
- Se agrega a App.tsx

---

## Feature 5 — Storage en Supabase

### Descripción
Todos los archivos adjuntos a issues se almacenan en un bucket privado de
Supabase Storage. El acceso se hace mediante signed URLs generadas por el
servidor con validez de 1 hora.

### Bucket
- **Nombre:** `paperclip-attachments`
- **Visibilidad:** Privado
- **Acceso:** Signed URLs (1 hora de validez)
- **Creación:** Automática al arrancar el servidor si no existe

### Estructura de paths
```
paperclip-attachments/
  issues/
    {issueId}/
      {uuid}-{originalFilename}
```

### Provider (supabase-provider.ts)
Implementa la interfaz StorageProvider existente:
```typescript
interface StorageProvider {
  upload(key, buffer, contentType, metadata): Promise<void>
  download(key): Promise<Buffer>
  delete(key): Promise<void>
  getSignedUrl(key, expiresInSeconds): Promise<string>
}
```

### Configuración
El provider se activa cuando existen las variables de entorno:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Si no están presentes, el sistema sigue usando el provider anterior
(S3 o local disk) para no romper instalaciones existentes.

### Variables de entorno a agregar al .env
```
SUPABASE_URL=https://yriwtksltzkynbvrweyf.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
```

---

## Archivos a crear

| # | Archivo | Descripción |
|---|---------|-------------|
| 1 | `server/src/storage/supabase-provider.ts` | Provider de Supabase Storage |
| 2 | `server/src/routes/gemini-analysis.ts` | 3 endpoints: analyze-document, generate-user-stories, library |
| 3 | `server/src/db/migrations/XXXX_add_project_ai_context.ts` | Migración: columna ai_context en projects |
| 4 | `ui/src/components/DocumentToTasksDialog.tsx` | Dialog: preview y creación de tareas desde documento |
| 5 | `ui/src/components/UserStoriesDialog.tsx` | Dialog: preview y creación de historias como subtareas |
| 6 | `ui/src/components/ProjectLibrary.tsx` | Tab Biblioteca con carpetas colapsables |

---

## Archivos a modificar

| # | Archivo | Cambio |
|---|---------|--------|
| 1 | `paperclip/.env` | Agregar SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY |
| 2 | `server/package.json` | Agregar @supabase/storage-js |
| 3 | `server/src/storage/index.ts` | Registrar Supabase provider cuando env vars estén presentes |
| 4 | `server/src/app.ts` | Registrar rutas de Gemini |
| 5 | `server/src/routes/projects.ts` | Endpoints GET/PUT /projects/:id/ai-context |
| 6 | `ui/src/api/issues.ts` | Agregar analyzeDocument() y generateUserStories() |
| 7 | `ui/src/api/projects.ts` | Agregar getLibrary(), getAiContext(), updateAiContext() |
| 8 | `ui/src/pages/ProjectDetail.tsx` | Tab Biblioteca + botón Generar desde documento + sección Info Proyecto |
| 9 | `ui/src/pages/IssueDetail.tsx` | Botón Generar historias de usuario + UserStoriesDialog |
| 10 | `ui/src/App.tsx` | Ruta /projects/:id/library |

---

## Orden de implementación

### Paso 1 — Infraestructura
- Agregar credenciales al .env
- Instalar @supabase/storage-js en server/package.json
- Crear supabase-provider.ts
- Registrar provider en storage/index.ts
- Crear bucket al arrancar el servidor

### Paso 2 — Base de datos
- Crear migración Drizzle para ai_context en projects
- Aplicar migración

### Paso 3 — Server routes
- Crear gemini-analysis.ts con los 3 endpoints
- Agregar endpoints ai-context en projects.ts
- Registrar rutas en app.ts

### Paso 4 — API client
- Actualizar issues.ts con analyzeDocument() y generateUserStories()
- Actualizar projects.ts con getLibrary(), getAiContext(), updateAiContext()

### Paso 5 — Componentes UI
- Crear DocumentToTasksDialog.tsx
- Crear UserStoriesDialog.tsx
- Crear ProjectLibrary.tsx

### Paso 6 — Páginas existentes
- Modificar ProjectDetail.tsx
- Modificar IssueDetail.tsx
- Modificar App.tsx

---

## Dependencias externas

| Dependencia | Versión | Uso |
|-------------|---------|-----|
| @supabase/storage-js | latest | Upload/download/signed URLs en Supabase |
| Gemini API | gemini-2.5-flash-lite | Análisis de documentos + generación de historias |

## Variables de entorno requeridas

| Variable | Descripción |
|----------|-------------|
| SUPABASE_URL | https://yriwtksltzkynbvrweyf.supabase.co |
| SUPABASE_SERVICE_ROLE_KEY | Service role key de Supabase |
| Gemini API key | Hardcoded en gemini-analysis.ts |
