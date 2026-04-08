import { Router } from "express";
import multer from "multer";
import { GoogleGenerativeAI } from "@google/generative-ai";
import mammoth from "mammoth";
import { eq, inArray } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { issues, projects, issueAttachments, assets, projectDocuments } from "@paperclipai/db";
import { assertCompanyAccess } from "./authz.js";
import type { StorageService } from "../storage/types.js";

const GEMINI_MODEL = "gemini-2.5-flash-lite";
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
});

function getGeminiClient(): GoogleGenerativeAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === "your-gemini-api-key-here") {
    throw new Error("GEMINI_API_KEY is not configured");
  }
  return new GoogleGenerativeAI(apiKey);
}

const TASK_EXTRACTION_PROMPT = `
Analiza el siguiente documento y extrae entre 3 y 15 tareas de desarrollo concretas.
Para cada tarea devuelve un objeto JSON con:
- title: string (máximo 120 caracteres, en español)
- description: string (descripción detallada en formato markdown, en español)
- priority: "low" | "medium" | "high" | "critical"

Responde ÚNICAMENTE con un array JSON válido, sin texto adicional ni bloques de código.
Ejemplo de formato esperado:
[{"title":"...","description":"...","priority":"medium"}]
`;

const USER_STORIES_PROMPT = (
  projectContext: string,
  docsContext: string,
  issueTitle: string,
  issueDescription: string,
) => `
${projectContext ? `Info del Proyecto:\n${projectContext}\n\n` : ""}${docsContext ? `Documentos de referencia del proyecto:\n${docsContext}\n\n` : ""}Tarea:
Título: ${issueTitle}
Descripción: ${issueDescription || "(sin descripción)"}

Generá entre 3 y 5 historias de usuario para esta tarea.
Para cada historia devuelve un objeto JSON con:
- title: string (formato: "Como [usuario], quiero [acción] para [beneficio]")
- description: string (criterios de aceptación en formato bullet list markdown)

Responde ÚNICAMENTE con un array JSON válido, sin texto adicional ni bloques de código.
Ejemplo: [{"title":"Como usuario, quiero...","description":"- Criterio 1\\n- Criterio 2"}]
`;

async function extractJsonArray(text: string): Promise<unknown[]> {
  const cleaned = text.trim().replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();
  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) throw new Error("Expected JSON array");
  return parsed;
}

async function extractTextFromBuffer(buffer: Buffer, contentType: string): Promise<string> {
  if (contentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  if (contentType === "application/pdf") {
    // PDFs returned as base64 for inline Gemini use — caller handles separately
    return "";
  }
  return buffer.toString("utf-8");
}

export function geminiAnalysisRoutes(db: Db, storage: StorageService) {
  const router = Router();

  // POST /companies/:companyId/analyze-document
  router.post("/companies/:companyId/analyze-document", (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) {
        res.status(400).json({ error: err.message });
        return;
      }
      next();
    });
  }, async (req, res) => {
    const { companyId } = req.params as { companyId: string };
    assertCompanyAccess(req, companyId);

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const { mimetype, buffer, originalname } = file;
    let genAI: GoogleGenerativeAI;
    try {
      genAI = getGeminiClient();
    } catch (e) {
      res.status(503).json({ error: (e as Error).message });
      return;
    }

    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let parts: any[];

    try {
      if (mimetype === "application/pdf") {
        parts = [
          TASK_EXTRACTION_PROMPT,
          { inlineData: { mimeType: "application/pdf", data: buffer.toString("base64") } },
        ];
      } else if (
        mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ) {
        const result = await mammoth.extractRawText({ buffer });
        parts = [`${TASK_EXTRACTION_PROMPT}\n\nContenido del documento:\n${result.value}`];
      } else {
        parts = [`${TASK_EXTRACTION_PROMPT}\n\nContenido del documento:\n${buffer.toString("utf-8")}`];
      }

      const response = await model.generateContent(parts);
      const text = response.response.text();
      const rawTasks = await extractJsonArray(text);

      const tasks = rawTasks.slice(0, 15).map((t: unknown) => {
        const task = t as Record<string, unknown>;
        return {
          title: String(task.title ?? "").slice(0, 120),
          description: String(task.description ?? ""),
          priority: (["low", "medium", "high", "critical"] as const).includes(task.priority as never)
            ? task.priority as "low" | "medium" | "high" | "critical"
            : "medium" as const,
        };
      });

      res.json({ tasks });
    } catch (e) {
      console.error("[gemini] analyze-document error:", e);
      res.status(500).json({ error: `Error al analizar el documento: ${(e as Error).message}` });
    }
  });

  // POST /issues/:id/generate-user-stories
  router.post("/issues/:id/generate-user-stories", async (req, res) => {
    const issueId = req.params.id as string;

    const issue = await db
      .select()
      .from(issues)
      .where(eq(issues.id, issueId))
      .then((rows) => rows[0] ?? null);

    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    assertCompanyAccess(req, issue.companyId);

    const project = issue.projectId
      ? await db.select().from(projects).where(eq(projects.id, issue.projectId)).then((r) => r[0] ?? null)
      : null;

    // Fetch project documents and extract text for context
    let docsContext = "";
    if (issue.projectId) {
      try {
        const docs = await db
          .select({
            assetId: projectDocuments.assetId,
            objectKey: assets.objectKey,
            originalFilename: assets.originalFilename,
            contentType: assets.contentType,
          })
          .from(projectDocuments)
          .innerJoin(assets, eq(projectDocuments.assetId, assets.id))
          .where(eq(projectDocuments.projectId, issue.projectId));

        const textParts: string[] = [];
        for (const doc of docs) {
          try {
            const obj = await storage.getObject(issue.companyId, doc.objectKey);
            const chunks: Buffer[] = [];
            for await (const chunk of obj.body) chunks.push(Buffer.from(chunk as Uint8Array));
            const buf = Buffer.concat(chunks);
            const text = await extractTextFromBuffer(buf, doc.contentType ?? "");
            if (text.trim()) {
              textParts.push(`--- ${doc.originalFilename ?? doc.assetId} ---\n${text.slice(0, 4000)}`);
            }
          } catch {
            // skip unreadable doc
          }
        }
        if (textParts.length > 0) docsContext = textParts.join("\n\n");
      } catch {
        // non-fatal: proceed without docs context
      }
    }

    let genAI: GoogleGenerativeAI;
    try {
      genAI = getGeminiClient();
    } catch (e) {
      res.status(503).json({ error: (e as Error).message });
      return;
    }

    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
    const prompt = USER_STORIES_PROMPT(
      project?.aiContext ?? "",
      docsContext,
      issue.title,
      issue.description ?? "",
    );

    try {
      const response = await model.generateContent(prompt);
      const text = response.response.text();
      const rawStories = await extractJsonArray(text);

      const userStories = rawStories.slice(0, 5).map((s: unknown) => {
        const story = s as Record<string, unknown>;
        return {
          title: String(story.title ?? ""),
          description: String(story.description ?? ""),
        };
      });

      res.json({ userStories });
    } catch (e) {
      console.error("[gemini] generate-user-stories error:", e);
      res.status(500).json({ error: `Error al generar historias: ${(e as Error).message}` });
    }
  });

  // POST /companies/:companyId/projects/:projectId/documents
  router.post("/companies/:companyId/projects/:projectId/documents", (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) {
        res.status(400).json({ error: err.message });
        return;
      }
      next();
    });
  }, async (req, res) => {
    const { companyId, projectId } = req.params as { companyId: string; projectId: string };
    assertCompanyAccess(req, companyId);

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    try {
      const stored = await storage.putFile({
        companyId,
        namespace: `projects/${projectId}/documents`,
        originalFilename: file.originalname || null,
        contentType: file.mimetype,
        body: file.buffer,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [asset] = await (db.insert(assets) as any).values({
        companyId,
        provider: stored.provider,
        objectKey: stored.objectKey,
        contentType: stored.contentType,
        byteSize: stored.byteSize,
        sha256: stored.sha256 ?? null,
        originalFilename: stored.originalFilename ?? null,
      }).returning();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [doc] = await (db.insert(projectDocuments) as any).values({
        projectId,
        companyId,
        assetId: asset.id,
      }).returning();

      res.status(201).json({
        id: doc.id,
        originalFilename: stored.originalFilename,
        contentType: stored.contentType,
        byteSize: stored.byteSize,
        createdAt: doc.createdAt,
      });
    } catch (e) {
      console.error("[gemini] upload project doc error:", e);
      res.status(500).json({ error: `Error al subir el documento: ${(e as Error).message}` });
    }
  });

  // GET /companies/:companyId/projects/:projectId/documents
  router.get("/companies/:companyId/projects/:projectId/documents", async (req, res) => {
    const { companyId, projectId } = req.params as { companyId: string; projectId: string };
    assertCompanyAccess(req, companyId);

    const rows = await db
      .select({
        id: projectDocuments.id,
        assetId: assets.id,
        originalFilename: assets.originalFilename,
        contentType: assets.contentType,
        byteSize: assets.byteSize,
        createdAt: projectDocuments.createdAt,
      })
      .from(projectDocuments)
      .innerJoin(assets, eq(projectDocuments.assetId, assets.id))
      .where(eq(projectDocuments.projectId, projectId));

    res.json(rows);
  });

  // DELETE /companies/:companyId/projects/:projectId/documents/:documentId
  router.delete("/companies/:companyId/projects/:projectId/documents/:documentId", async (req, res) => {
    const { companyId, projectId, documentId } = req.params as {
      companyId: string;
      projectId: string;
      documentId: string;
    };
    assertCompanyAccess(req, companyId);

    const doc = await db
      .select({ id: projectDocuments.id, assetId: projectDocuments.assetId, objectKey: assets.objectKey })
      .from(projectDocuments)
      .innerJoin(assets, eq(projectDocuments.assetId, assets.id))
      .where(eq(projectDocuments.id, documentId))
      .then((r) => r[0] ?? null);

    if (!doc) {
      res.status(404).json({ error: "Document not found" });
      return;
    }

    try {
      await storage.deleteObject(companyId, doc.objectKey);
    } catch {
      // ignore storage errors, still remove from DB
    }

    await db.delete(projectDocuments).where(eq(projectDocuments.id, documentId));

    res.status(204).end();
  });

  // GET /companies/:companyId/projects/:projectId/library (legacy issue attachments)
  router.get("/companies/:companyId/projects/:projectId/library", async (req, res) => {
    const { companyId, projectId } = req.params as { companyId: string; projectId: string };
    assertCompanyAccess(req, companyId);

    const projectIssues = await db
      .select({ id: issues.id, title: issues.title, identifier: issues.identifier, status: issues.status })
      .from(issues)
      .where(eq(issues.projectId, projectId));

    if (projectIssues.length === 0) {
      res.json({ folders: [] });
      return;
    }

    const issueIds = projectIssues.map((i) => i.id);

    const attachmentRows = await db
      .select({
        attachmentId: issueAttachments.id,
        issueId: issueAttachments.issueId,
        assetId: assets.id,
        originalFilename: assets.originalFilename,
        contentType: assets.contentType,
        byteSize: assets.byteSize,
        createdAt: issueAttachments.createdAt,
      })
      .from(issueAttachments)
      .innerJoin(assets, eq(issueAttachments.assetId, assets.id))
      .where(inArray(issueAttachments.issueId, issueIds));

    const byIssueId = new Map<string, typeof attachmentRows>();
    for (const row of attachmentRows) {
      const existing = byIssueId.get(row.issueId) ?? [];
      existing.push(row);
      byIssueId.set(row.issueId, existing);
    }

    const folders = projectIssues
      .filter((issue) => byIssueId.has(issue.id))
      .map((issue) => ({
        issueId: issue.id,
        issueTitle: issue.title,
        issueIdentifier: issue.identifier,
        issueStatus: issue.status,
        attachments: (byIssueId.get(issue.id) ?? []).map((a) => ({
          id: a.attachmentId,
          originalFilename: a.originalFilename,
          contentType: a.contentType,
          byteSize: a.byteSize,
          contentPath: `/api/attachments/${a.attachmentId}/content`,
          createdAt: a.createdAt,
        })),
      }));

    res.json({ folders });
  });

  return router;
}
