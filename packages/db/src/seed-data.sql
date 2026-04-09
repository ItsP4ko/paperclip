-- Paperclip Production Seed Data
-- Auto-generated from Supabase prod

-- Disable FK checks for all operations
SET session_replication_role = 'replica';

-- Clean existing seed data
DELETE FROM issue_comments;
DELETE FROM issues;
DELETE FROM routines;
DELETE FROM budget_policies;
DELETE FROM documents;
DELETE FROM projects;
DELETE FROM goals;
DELETE FROM company_memberships;
DELETE FROM agents;
DELETE FROM companies;
DELETE FROM instance_user_roles;


-- Companies
INSERT INTO "companies" ("id", "name", "description", "status", "issue_prefix", "issue_counter", "budget_monthly_cents", "spent_monthly_cents", "require_board_approval_for_new_agents", "feedback_data_sharing_enabled", "brand_color", "remote_control_enabled", "created_at", "updated_at") VALUES ('beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'Rosental', NULL, 'active', 'PAC', 43, 0, 0, false, false, NULL, true, '2026-04-01T19:32:30.330931+00:00', '2026-04-09T14:21:13.926+00:00');
INSERT INTO "companies" ("id", "name", "description", "status", "issue_prefix", "issue_counter", "budget_monthly_cents", "spent_monthly_cents", "require_board_approval_for_new_agents", "feedback_data_sharing_enabled", "brand_color", "remote_control_enabled", "created_at", "updated_at") VALUES ('85b9dfd2-6c89-4676-8358-3cb2b6495f86', 'n8n', NULL, 'active', 'PACA', 24, 0, 0, false, false, NULL, false, '2026-04-01T22:11:26.32619+00:00', '2026-04-08T19:40:31.607+00:00');
INSERT INTO "companies" ("id", "name", "description", "status", "issue_prefix", "issue_counter", "budget_monthly_cents", "spent_monthly_cents", "require_board_approval_for_new_agents", "feedback_data_sharing_enabled", "brand_color", "remote_control_enabled", "created_at", "updated_at") VALUES ('aa76d3cd-4273-4443-83c8-70931173e770', 'vinoteca', NULL, 'active', 'VIN', 19, 0, 0, false, false, NULL, false, '2026-04-02T03:16:27.461038+00:00', '2026-04-04T20:58:21.822+00:00');

-- Agents
INSERT INTO "agents" ("id", "company_id", "name", "role", "title", "icon", "status", "reports_to", "capabilities", "adapter_type", "adapter_config", "runtime_config", "budget_monthly_cents", "spent_monthly_cents", "permissions", "metadata", "agent_md", "created_at", "updated_at") VALUES ('d48d6423-4826-4770-8844-66409d2c49ee', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'CEO', 'ceo', NULL, NULL, 'idle', NULL, NULL, 'claude_local', '{"mode": "", "model": "", "effort": "", "variant": "", "graceSec": 15, "timeoutSec": 0, "maxTurnsPerRun": 150, "instructionsFilePath": null, "instructionsRootPath": null, "modelReasoningEffort": "", "instructionsEntryFile": "AGENTS.md", "instructionsBundleMode": "external", "dangerouslySkipPermissions": true}'::jsonb, '{"heartbeat": {"enabled": false, "cooldownSec": 10, "intervalSec": 3600, "wakeOnDemand": true, "maxConcurrentRuns": 1}, "executionTarget": "local_runner"}'::jsonb, 500, 0, '{"canCreateAgents": true}'::jsonb, NULL, NULL, '2026-04-01T19:32:55.711318+00:00', '2026-04-07T21:33:17.896+00:00');
INSERT INTO "agents" ("id", "company_id", "name", "role", "title", "icon", "status", "reports_to", "capabilities", "adapter_type", "adapter_config", "runtime_config", "budget_monthly_cents", "spent_monthly_cents", "permissions", "metadata", "agent_md", "created_at", "updated_at") VALUES ('17fa4545-c205-4692-b227-9b1d1aff93a6', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'CEO 2', 'ceo', NULL, NULL, 'terminated', NULL, NULL, 'claude_local', '{"model": "claude-sonnet-4-6", "graceSec": 15, "timeoutSec": 0, "maxTurnsPerRun": 300, "instructionsFilePath": null, "instructionsRootPath": null, "instructionsEntryFile": "AGENTS.md", "instructionsBundleMode": "managed", "dangerouslySkipPermissions": true}'::jsonb, '{"heartbeat": {"enabled": true, "cooldownSec": 10, "intervalSec": 3600, "wakeOnDemand": true, "maxConcurrentRuns": 1}}'::jsonb, 0, 0, '{"canCreateAgents": true}'::jsonb, NULL, NULL, '2026-04-01T19:33:27.410809+00:00', '2026-04-01T19:33:55.721+00:00');
INSERT INTO "agents" ("id", "company_id", "name", "role", "title", "icon", "status", "reports_to", "capabilities", "adapter_type", "adapter_config", "runtime_config", "budget_monthly_cents", "spent_monthly_cents", "permissions", "metadata", "agent_md", "created_at", "updated_at") VALUES ('19f107ec-b43a-4ab6-ad60-b743253725c8', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'CEO n8n', 'ceo', NULL, NULL, 'terminated', NULL, NULL, 'claude_local', '{"model": "claude-sonnet-4-6", "chrome": true, "effort": "medium", "command": "claudeyolo", "graceSec": 15, "timeoutSec": 0, "maxTurnsPerRun": 300, "promptTemplate": "Multi-agent orchestration specialist coordinating multiple specialized subagents for complex workflows. Breaks down large tasks, delegates effectively, and synthesizes results into coherent solutions.", "instructionsFilePath": null, "dangerouslySkipPermissions": true}'::jsonb, '{"heartbeat": {"enabled": true, "cooldownSec": 10, "intervalSec": 300, "wakeOnDemand": true, "maxConcurrentRuns": 1}}'::jsonb, 0, 0, '{"canCreateAgents": true}'::jsonb, NULL, NULL, '2026-04-01T19:57:36.826136+00:00', '2026-04-01T20:59:30.026+00:00');
INSERT INTO "agents" ("id", "company_id", "name", "role", "title", "icon", "status", "reports_to", "capabilities", "adapter_type", "adapter_config", "runtime_config", "budget_monthly_cents", "spent_monthly_cents", "permissions", "metadata", "agent_md", "created_at", "updated_at") VALUES ('73f5ce68-0c3b-410d-8f85-0024dd46c37f', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'CEO Rosental', 'ceo', NULL, NULL, 'terminated', NULL, NULL, 'claude_local', '{"model": "claude-sonnet-4-6", "effort": "medium", "command": "claudeyolo", "graceSec": 15, "timeoutSec": 0, "maxTurnsPerRun": 300, "instructionsFilePath": null, "instructionsRootPath": null, "instructionsEntryFile": "appminuta-orchestrator.md", "instructionsBundleMode": "external", "dangerouslySkipPermissions": true}'::jsonb, '{"heartbeat": {"enabled": true, "cooldownSec": 10, "intervalSec": 300, "wakeOnDemand": true, "maxConcurrentRuns": 1}}'::jsonb, 0, 0, '{"canCreateAgents": true}'::jsonb, NULL, NULL, '2026-04-01T21:04:42.965301+00:00', '2026-04-01T21:15:32.597+00:00');
INSERT INTO "agents" ("id", "company_id", "name", "role", "title", "icon", "status", "reports_to", "capabilities", "adapter_type", "adapter_config", "runtime_config", "budget_monthly_cents", "spent_monthly_cents", "permissions", "metadata", "agent_md", "created_at", "updated_at") VALUES ('16a977ab-7557-4e0e-bd81-8791ba1eff1f', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'n8n Expert', 'engineer', 'n8n Workflow Specialist', 'zap', 'terminated', '05069531-0435-42da-9d23-5e4c1529fb9f', 'Builds, debugs, and optimizes n8n workflows for automation tasks. Integrates external APIs, webhooks, and databases into n8n.', 'claude_local', '{"cwd": null, "model": "claude-sonnet-4-6", "graceSec": 15, "maxTurnsPerRun": 100, "instructionsFilePath": null, "dangerouslySkipPermissions": true}'::jsonb, '{"heartbeat": {"enabled": true, "intervalSec": 3600, "wakeOnDemand": true, "maxConcurrentRuns": 1}}'::jsonb, 0, 0, '{"canCreateAgents": false}'::jsonb, NULL, NULL, '2026-04-01T21:06:02.683445+00:00', '2026-04-01T22:13:00.914+00:00');
INSERT INTO "agents" ("id", "company_id", "name", "role", "title", "icon", "status", "reports_to", "capabilities", "adapter_type", "adapter_config", "runtime_config", "budget_monthly_cents", "spent_monthly_cents", "permissions", "metadata", "agent_md", "created_at", "updated_at") VALUES ('7ce4702a-373d-46d2-b2d7-b95f15d59ba9', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'Prompt Engineer', 'researcher', 'Prompt Engineer', 'wand', 'terminated', '05069531-0435-42da-9d23-5e4c1529fb9f', 'Designs, refines, and optimizes prompts for LLM-powered systems and AI agents. Produces prompt templates for n8n AI nodes.', 'claude_local', '{"cwd": null, "model": "claude-sonnet-4-6", "graceSec": 15, "maxTurnsPerRun": 100, "instructionsFilePath": null, "dangerouslySkipPermissions": true}'::jsonb, '{"heartbeat": {"enabled": true, "intervalSec": 3600, "wakeOnDemand": true, "maxConcurrentRuns": 1}}'::jsonb, 0, 0, '{"canCreateAgents": false}'::jsonb, NULL, NULL, '2026-04-01T21:06:15.005406+00:00', '2026-04-01T22:13:03.803+00:00');
INSERT INTO "agents" ("id", "company_id", "name", "role", "title", "icon", "status", "reports_to", "capabilities", "adapter_type", "adapter_config", "runtime_config", "budget_monthly_cents", "spent_monthly_cents", "permissions", "metadata", "agent_md", "created_at", "updated_at") VALUES ('4fb22a8f-dcef-4664-939d-4add7e139a3a', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'Workflow Engineer', 'engineer', 'Workflow Systems Engineer', 'git-branch', 'terminated', '05069531-0435-42da-9d23-5e4c1529fb9f', 'Designs end-to-end automation workflow specifications. Translates business requirements into detailed workflow blueprints for the n8n Expert to implement.', 'claude_local', '{"cwd": null, "model": "claude-sonnet-4-6", "graceSec": 15, "maxTurnsPerRun": 100, "instructionsFilePath": null, "dangerouslySkipPermissions": true}'::jsonb, '{"heartbeat": {"enabled": true, "intervalSec": 3600, "wakeOnDemand": true, "maxConcurrentRuns": 1}}'::jsonb, 0, 0, '{"canCreateAgents": false}'::jsonb, NULL, NULL, '2026-04-01T21:06:19.049523+00:00', '2026-04-01T22:13:12.185+00:00');
INSERT INTO "agents" ("id", "company_id", "name", "role", "title", "icon", "status", "reports_to", "capabilities", "adapter_type", "adapter_config", "runtime_config", "budget_monthly_cents", "spent_monthly_cents", "permissions", "metadata", "agent_md", "created_at", "updated_at") VALUES ('87473cb4-1b22-41ac-9237-92756ce89cb3', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'CEO rosental', 'general', NULL, NULL, 'idle', 'd48d6423-4826-4770-8844-66409d2c49ee', NULL, 'claude_local', '{"model": "claude-sonnet-4-6", "graceSec": 15, "timeoutSec": 0, "maxTurnsPerRun": 300, "instructionsFilePath": null, "instructionsRootPath": null, "instructionsEntryFile": "appminuta-orchestrator.md", "instructionsBundleMode": "external", "dangerouslySkipPermissions": true}'::jsonb, '{"heartbeat": {"enabled": false, "cooldownSec": 10, "intervalSec": 3600, "wakeOnDemand": true, "maxConcurrentRuns": 1}, "executionTarget": "local_runner"}'::jsonb, 0, 0, '{"canCreateAgents": false}'::jsonb, NULL, '---
name: appminuta-orchestrator
description: "Orquestador central de AppMinuta. Recibe mensajes del usuario, analiza qué se necesita, define el modo de operación, y despacha a los agentes especializados. Es el punto de entrada único — los demás agentes son invocados por el orquestador. Maneja los M

<!-- truncated for dev seed -->', '2026-04-01T21:16:40.273796+00:00', '2026-04-09T14:25:32.973+00:00');
INSERT INTO "agents" ("id", "company_id", "name", "role", "title", "icon", "status", "reports_to", "capabilities", "adapter_type", "adapter_config", "runtime_config", "budget_monthly_cents", "spent_monthly_cents", "permissions", "metadata", "agent_md", "created_at", "updated_at") VALUES ('a26366e5-a1ee-4d0a-a5d0-4f129f7705f7', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'Backend Architect', 'engineer', NULL, NULL, 'idle', '87473cb4-1b22-41ac-9237-92756ce89cb3', 'Arquitecto Backend NestJS + Prisma + Supabase para AppMinuta. Diseña e implementa servicios, guards, cache strategies, queues, y WebSocket con foco en performance y seguridad. NUNCA ejecuta migraciones automaticamente.', 'claude_local', '{"cwd": null, "model": "claude-sonnet-4-6", "graceSec": 15, "maxTurnsPerRun": 150, "instructionsFilePath": null, "instructionsRootPath": null, "instructionsEntryFile": "appminuta-backend-architect.md", "instructionsBundleMode": "external", "dangerouslySkipPermissions": true}'::jsonb, '{"heartbeat": {"enabled": false}, "executionTarget": "local_runner"}'::jsonb, 0, 0, '{"canCreateAgents": false}'::jsonb, NULL, '---
name: appminuta-backend-architect
description: "Arquitecto Backend NestJS + Prisma + Supabase para AppMinuta. Diseña e implementa servicios, guards, cache strategies, queues, y WebSocket con foco en performance y seguridad. NUNCA ejecuta migraciones automaticamente.

<example>
  <context>El usua

<!-- truncated for dev seed -->', '2026-04-01T21:25:06.961803+00:00', '2026-04-09T14:25:46.327+00:00');
INSERT INTO "agents" ("id", "company_id", "name", "role", "title", "icon", "status", "reports_to", "capabilities", "adapter_type", "adapter_config", "runtime_config", "budget_monthly_cents", "spent_monthly_cents", "permissions", "metadata", "agent_md", "created_at", "updated_at") VALUES ('72ea4532-09e6-4fe8-90f1-c9569a2ad1e7', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'Backend Planner', 'engineer', NULL, NULL, 'idle', '87473cb4-1b22-41ac-9237-92756ce89cb3', 'Planificador estrategico para implementaciones Backend en AppMinuta (NestJS + Prisma + Bull + Redis). Analiza codigo y BD real, produce planes con SQL para revision manual, secuencia de implementacion, y validacion. NUNCA ejecuta migraciones ni codigo sin aprobacion.', 'claude_local', '{"cwd": null, "model": "claude-sonnet-4-6", "graceSec": 15, "maxTurnsPerRun": 150, "instructionsFilePath": null, "instructionsRootPath": null, "instructionsEntryFile": "appminuta-backend-planner.md", "instructionsBundleMode": "external", "dangerouslySkipPermissions": true}'::jsonb, '{"heartbeat": {"enabled": false}, "executionTarget": "local_runner"}'::jsonb, 0, 0, '{"canCreateAgents": false}'::jsonb, NULL, '---
name: appminuta-backend-planner
description: "Planificador estrategico para implementaciones Backend en AppMinuta (NestJS + Prisma + Bull + Redis). Analiza codigo y BD real, produce planes con SQL para revision manual, secuencia de implementacion, y validacion. NUNCA ejecuta migraciones ni codig

<!-- truncated for dev seed -->', '2026-04-01T21:25:10.99123+00:00', '2026-04-09T14:30:13.574+00:00');
INSERT INTO "agents" ("id", "company_id", "name", "role", "title", "icon", "status", "reports_to", "capabilities", "adapter_type", "adapter_config", "runtime_config", "budget_monthly_cents", "spent_monthly_cents", "permissions", "metadata", "agent_md", "created_at", "updated_at") VALUES ('dd9adbad-d4df-4cef-b6a1-cd1412161421', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'DB Architect', 'engineer', NULL, NULL, 'idle', '87473cb4-1b22-41ac-9237-92756ce89cb3', 'Arquitecto de Base de Datos PostgreSQL 17 + Supabase Self-Hosted + Prisma. Diseña schemas, optimiza queries, escribe migraciones SQL (para revision manual), configura RLS, y monitorea performance. NUNCA ejecuta migraciones sin aprobacion.', 'claude_local', '{"cwd": null, "model": "claude-sonnet-4-6", "graceSec": 15, "maxTurnsPerRun": 150, "instructionsFilePath": null, "instructionsRootPath": null, "instructionsEntryFile": "appminuta-db-architect.md", "instructionsBundleMode": "external", "dangerouslySkipPermissions": true}'::jsonb, '{"heartbeat": {"enabled": false}, "executionTarget": "local_runner"}'::jsonb, 0, 0, '{"canCreateAgents": false}'::jsonb, NULL, '---
name: appminuta-db-architect
description: "Arquitecto de Base de Datos PostgreSQL 17 + Supabase Self-Hosted + Prisma. Diseña schemas, optimiza queries, escribe migraciones SQL (para revision manual), configura RLS, y monitorea performance. NUNCA ejecuta migraciones sin aprobacion.

<example>
  <

<!-- truncated for dev seed -->', '2026-04-01T21:25:14.66428+00:00', '2026-04-09T14:30:44.978+00:00');
INSERT INTO "agents" ("id", "company_id", "name", "role", "title", "icon", "status", "reports_to", "capabilities", "adapter_type", "adapter_config", "runtime_config", "budget_monthly_cents", "spent_monthly_cents", "permissions", "metadata", "agent_md", "created_at", "updated_at") VALUES ('b68e9121-2237-4524-999b-4c13955830cb', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'Frontend Planner', 'engineer', NULL, NULL, 'idle', '87473cb4-1b22-41ac-9237-92756ce89cb3', 'Planificador estrategico para implementaciones Frontend en AppMinuta. Analiza codigo real, produce planes detallados con archivos afectados, dependencias, riesgos y validacion. NO ejecuta codigo sin aprobacion explicita.', 'claude_local', '{"cwd": null, "model": "claude-sonnet-4-6", "graceSec": 15, "maxTurnsPerRun": 150, "instructionsFilePath": null, "instructionsRootPath": null, "instructionsEntryFile": "appminuta-frontend-planner.md", "instructionsBundleMode": "external", "dangerouslySkipPermissions": true}'::jsonb, '{"heartbeat": {"enabled": false}, "executionTarget": "local_runner"}'::jsonb, 0, 0, '{"canCreateAgents": false}'::jsonb, NULL, '---
name: appminuta-frontend-planner
description: "Planificador estrategico para implementaciones Frontend en AppMinuta. Analiza codigo real, produce planes detallados con archivos afectados, dependencias, riesgos y validacion. NO ejecuta codigo sin aprobacion explicita.

<example>
  <context>El usu

<!-- truncated for dev seed -->', '2026-04-01T21:25:16.795913+00:00', '2026-04-09T14:32:10.821+00:00');
INSERT INTO "agents" ("id", "company_id", "name", "role", "title", "icon", "status", "reports_to", "capabilities", "adapter_type", "adapter_config", "runtime_config", "budget_monthly_cents", "spent_monthly_cents", "permissions", "metadata", "agent_md", "created_at", "updated_at") VALUES ('1d19c36a-1289-402f-b387-c6054c2d2a0d', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'Backend Architect 2', 'engineer', NULL, NULL, 'terminated', '87473cb4-1b22-41ac-9237-92756ce89cb3', 'NestJS + Prisma + Supabase backend architect for AppMinuta', 'process', '{}'::jsonb, '{}'::jsonb, 0, 0, '{"canCreateAgents": false}'::jsonb, NULL, NULL, '2026-04-01T21:25:22.273255+00:00', '2026-04-01T21:28:41.419+00:00');
INSERT INTO "agents" ("id", "company_id", "name", "role", "title", "icon", "status", "reports_to", "capabilities", "adapter_type", "adapter_config", "runtime_config", "budget_monthly_cents", "spent_monthly_cents", "permissions", "metadata", "agent_md", "created_at", "updated_at") VALUES ('174b498e-ae15-4009-90a7-c9eee24c6181', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'Backend Architect 3', 'engineer', NULL, NULL, 'terminated', '87473cb4-1b22-41ac-9237-92756ce89cb3', 'Arquitecto Backend NestJS + Prisma + Supabase para AppMinuta', 'process', '{}'::jsonb, '{}'::jsonb, 0, 0, '{"canCreateAgents": false}'::jsonb, NULL, NULL, '2026-04-01T21:25:48.355271+00:00', '2026-04-01T21:28:43.426+00:00');
INSERT INTO "agents" ("id", "company_id", "name", "role", "title", "icon", "status", "reports_to", "capabilities", "adapter_type", "adapter_config", "runtime_config", "budget_monthly_cents", "spent_monthly_cents", "permissions", "metadata", "agent_md", "created_at", "updated_at") VALUES ('232c3049-1208-4bc2-b193-86e475dc3908', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'MFE Architect', 'engineer', NULL, NULL, 'idle', '87473cb4-1b22-41ac-9237-92756ce89cb3', 'Microfrontend architect using Module Federation. Designs Shell+MV+UIF+Frontend communication, shared deps, CSS isolation, and independent deploy.', 'claude_local', '{"cwd": null, "model": "claude-sonnet-4-6", "graceSec": 15, "maxTurnsPerRun": 150, "instructionsFilePath": null, "instructionsRootPath": null, "instructionsEntryFile": "appminuta-mfe-architect.md", "instructionsBundleMode": "external", "dangerouslySkipPermissions": true}'::jsonb, '{"heartbeat": {"enabled": false}, "executionTarget": "local_runner"}'::jsonb, 0, 0, '{"canCreateAgents": false}'::jsonb, NULL, '---
name: appminuta-mfe-architect
description: "Arquitecto de Microfrontends con Module Federation (@originjs/vite-plugin-federation). Diseña la arquitectura de comunicacion, shared deps, CSS isolation, y deploy independiente entre Shell, MV, UIF y Frontend principal.

<example>
  <context>El usuari

<!-- truncated for dev seed -->', '2026-04-01T21:26:19.686652+00:00', '2026-04-09T14:33:36.433+00:00');
INSERT INTO "agents" ("id", "company_id", "name", "role", "title", "icon", "status", "reports_to", "capabilities", "adapter_type", "adapter_config", "runtime_config", "budget_monthly_cents", "spent_monthly_cents", "permissions", "metadata", "agent_md", "created_at", "updated_at") VALUES ('e6a83e03-3b51-4e02-96a8-dd7da4cdd2ee', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'Security Engineer', 'engineer', NULL, NULL, 'error', '87473cb4-1b22-41ac-9237-92756ce89cb3', 'Security auditor for AppMinuta. Reviews Frontend + Backend + DB + Docker infra. Expert in Supabase JWT, NestJS Guards, OWASP Top 10, RLS, CSP, and secrets management.', 'claude_local', '{"cwd": null, "model": "claude-sonnet-4-6", "graceSec": 15, "maxTurnsPerRun": 150, "instructionsFilePath": null, "instructionsRootPath": null, "instructionsEntryFile": "appminuta-security.md", "instructionsBundleMode": "external", "dangerouslySkipPermissions": true}'::jsonb, '{"heartbeat": {"enabled": false}, "executionTarget": "local_runner"}'::jsonb, 0, 0, '{"canCreateAgents": false}'::jsonb, NULL, '---
name: appminuta-security
description: "Agente de seguridad integral para AppMinuta. Audita y fortalece Frontend + Backend + Base de Datos + Infra Docker. Experto en Supabase JWT, NestJS Guards, OWASP Top 10, RLS, CSP, y secrets management.

<example>
  <context>El usuario quiere una auditoria de

<!-- truncated for dev seed -->', '2026-04-01T21:26:23.011838+00:00', '2026-04-09T14:34:02.407+00:00');
INSERT INTO "agents" ("id", "company_id", "name", "role", "title", "icon", "status", "reports_to", "capabilities", "adapter_type", "adapter_config", "runtime_config", "budget_monthly_cents", "spent_monthly_cents", "permissions", "metadata", "agent_md", "created_at", "updated_at") VALUES ('e3e62f3c-6de9-4528-9ab0-ffad0d6c1676', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'QA Engineer', 'engineer', NULL, NULL, 'idle', '87473cb4-1b22-41ac-9237-92756ce89cb3', 'Full QA for AppMinuta stack: NestJS + React + Module Federation + Supabase. Writes and runs unit, integration, and E2E tests. Analyzes coverage and validates before merging.', 'claude_local', '{"cwd": null, "model": "claude-sonnet-4-6", "graceSec": 15, "maxTurnsPerRun": 150, "instructionsFilePath": null, "instructionsRootPath": null, "instructionsEntryFile": "appminuta-tester.md", "instructionsBundleMode": "external", "dangerouslySkipPermissions": true}'::jsonb, '{"heartbeat": {"enabled": false}, "executionTarget": "local_runner"}'::jsonb, 0, 0, '{"canCreateAgents": false}'::jsonb, NULL, '---
name: appminuta-tester
description: "QA completo para el stack AppMinuta: NestJS + React + Module Federation + Supabase. Escribe y ejecuta tests unitarios, de integracion y E2E. Analiza coverage, identifica gaps, y valida que todo funcione antes de mergear.

<example>
  <context>El usuario quier

<!-- truncated for dev seed -->', '2026-04-01T21:26:25.644484+00:00', '2026-04-09T14:34:38.057+00:00');
INSERT INTO "agents" ("id", "company_id", "name", "role", "title", "icon", "status", "reports_to", "capabilities", "adapter_type", "adapter_config", "runtime_config", "budget_monthly_cents", "spent_monthly_cents", "permissions", "metadata", "agent_md", "created_at", "updated_at") VALUES ('32403353-6ad3-4521-a9c7-a5c8f51ff9a8', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'UX/UI Designer', 'designer', NULL, NULL, 'idle', '87473cb4-1b22-41ac-9237-92756ce89cb3', 'UX/UI expert for AppMinuta SaaS real estate app. Evidence-based UX research combined with React + TypeScript + shadcn/ui + Tailwind CSS implementation.', 'claude_local', '{"cwd": null, "model": "claude-sonnet-4-6", "graceSec": 15, "maxTurnsPerRun": 150, "instructionsFilePath": null, "instructionsRootPath": null, "instructionsEntryFile": "appminuta-ux-ui.md", "instructionsBundleMode": "external", "dangerouslySkipPermissions": true}'::jsonb, '{"heartbeat": {"enabled": false}, "executionTarget": "local_runner"}'::jsonb, 0, 0, '{"canCreateAgents": false}'::jsonb, NULL, '---
name: appminuta-ux-ui
description: "Experto en UX/UI Design + implementacion Frontend para aplicacion empresarial SaaS inmobiliaria. Combina investigacion UX basada en evidencia (Nielsen Norman Group) con implementacion real en React + TypeScript + shadcn/ui + Tailwind CSS.

<example>
  <context

<!-- truncated for dev seed -->', '2026-04-01T21:26:28.164723+00:00', '2026-04-09T14:34:20.581+00:00');
INSERT INTO "agents" ("id", "company_id", "name", "role", "title", "icon", "status", "reports_to", "capabilities", "adapter_type", "adapter_config", "runtime_config", "budget_monthly_cents", "spent_monthly_cents", "permissions", "metadata", "agent_md", "created_at", "updated_at") VALUES ('d0c84936-dd12-4c48-9701-5de5c3ec6eef', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'Code Reviewer', 'general', 'Code Review Specialist', 'eye', 'error', '87473cb4-1b22-41ac-9237-92756ce89cb3', 'Comprehensive code reviews focusing on code quality, security vulnerabilities, and best practices.', 'claude_local', '{"model": "claude-sonnet-4-6", "graceSec": 15, "maxTurnsPerRun": 100, "instructionsFilePath": null, "instructionsRootPath": null, "instructionsEntryFile": "code-reviewer.md", "instructionsBundleMode": "external", "dangerouslySkipPermissions": true}'::jsonb, '{"heartbeat": {"enabled": false, "intervalSec": 3600, "wakeOnDemand": true, "maxConcurrentRuns": 1}, "executionTarget": "local_runner"}'::jsonb, 0, 0, '{"canCreateAgents": false}'::jsonb, NULL, '---
name: code-reviewer
description: "Use this agent when you need to conduct comprehensive code reviews focusing on code quality, security vulnerabilities, and best practices. Specifically:\\n\\n<example>\\nContext: Developer has submitted a pull request with changes to critical authentication logi

<!-- truncated for dev seed -->', '2026-04-01T21:47:42.02797+00:00', '2026-04-09T14:52:36.306+00:00');
INSERT INTO "agents" ("id", "company_id", "name", "role", "title", "icon", "status", "reports_to", "capabilities", "adapter_type", "adapter_config", "runtime_config", "budget_monthly_cents", "spent_monthly_cents", "permissions", "metadata", "agent_md", "created_at", "updated_at") VALUES ('e4b9c3e5-cbe7-496f-9339-a4cf4d00721f', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'Diagram Architect', 'general', 'Technical Diagram Architect', 'circuit-board', 'error', '87473cb4-1b22-41ac-9237-92756ce89cb3', 'Create technical diagrams in multiple formats (ASCII, Mermaid, PlantUML, Draw.io). Architecture visualization, ERD generation, flowcharts, state machines, and dependency graphs.', 'claude_local', '{"model": "claude-sonnet-4-6", "graceSec": 15, "maxTurnsPerRun": 80, "instructionsFilePath": null, "instructionsRootPath": null, "instructionsEntryFile": "diagram-architect.md", "instructionsBundleMode": "external", "dangerouslySkipPermissions": true}'::jsonb, '{"heartbeat": {"enabled": false, "intervalSec": 3600, "wakeOnDemand": true, "maxConcurrentRuns": 1}, "executionTarget": "local_runner"}'::jsonb, 0, 0, '{"canCreateAgents": false}'::jsonb, NULL, '---
name: diagram-architect
description: Create technical diagrams in multiple formats (ASCII, Mermaid, PlantUML, Draw.io). Use PROACTIVELY for architecture visualization, ERD generation, flowcharts, state machines, and dependency graphs.
tools: Read, Write, Edit, Bash
---

# Diagram Architect Agent

<!-- truncated for dev seed -->', '2026-04-01T21:47:45.953922+00:00', '2026-04-09T14:31:00.49+00:00');
INSERT INTO "agents" ("id", "company_id", "name", "role", "title", "icon", "status", "reports_to", "capabilities", "adapter_type", "adapter_config", "runtime_config", "budget_monthly_cents", "spent_monthly_cents", "permissions", "metadata", "agent_md", "created_at", "updated_at") VALUES ('868cf94b-ed2f-4a1e-83c2-a52ce4bb45c5', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'Documentation Engineer', 'general', 'Documentation Systems Engineer', 'file-code', 'error', '87473cb4-1b22-41ac-9237-92756ce89cb3', 'Create, architect, or overhaul comprehensive documentation systems including API docs, tutorials, guides, and developer-friendly content.', 'claude_local', '{"model": "claude-sonnet-4-6", "graceSec": 15, "maxTurnsPerRun": 150, "instructionsFilePath": null, "instructionsRootPath": null, "instructionsEntryFile": "documentation-engineer.md", "instructionsBundleMode": "external", "dangerouslySkipPermissions": true}'::jsonb, '{"heartbeat": {"enabled": false, "intervalSec": 3600, "wakeOnDemand": true, "maxConcurrentRuns": 1}, "executionTarget": "local_runner"}'::jsonb, 0, 0, '{"canCreateAgents": false}'::jsonb, NULL, '---
name: documentation-engineer
description: "Use this agent when you need to create, architect, or overhaul comprehensive documentation systems including API docs, tutorials, guides, and developer-friendly content that keeps pace with code changes. Specifically:\\n\\n<example>\\nContext: A project

<!-- truncated for dev seed -->', '2026-04-01T21:47:49.840125+00:00', '2026-04-09T14:31:28.05+00:00');
INSERT INTO "agents" ("id", "company_id", "name", "role", "title", "icon", "status", "reports_to", "capabilities", "adapter_type", "adapter_config", "runtime_config", "budget_monthly_cents", "spent_monthly_cents", "permissions", "metadata", "agent_md", "created_at", "updated_at") VALUES ('05069531-0435-42da-9d23-5e4c1529fb9f', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'CEO Paco', 'general', 'CEO Paco — Automation Project Lead', 'crown', 'terminated', 'd48d6423-4826-4770-8844-66409d2c49ee', 'Manages the Paco automation project. Coordinates n8n Expert, Prompt Engineer, and Workflow Engineer to deliver automation workflows. Reports directly to the main CEO.', 'claude_local', '{"cwd": null, "model": "claude-sonnet-4-6", "graceSec": 15, "timeoutSec": 0, "maxTurnsPerRun": 200, "instructionsFilePath": null, "dangerouslySkipPermissions": true}'::jsonb, '{"heartbeat": {"enabled": true, "cooldownSec": 10, "intervalSec": 3600, "wakeOnDemand": true, "maxConcurrentRuns": 1}}'::jsonb, 0, 0, '{"canCreateAgents": false}'::jsonb, NULL, NULL, '2026-04-01T22:08:42.097125+00:00', '2026-04-01T22:13:07.254+00:00');
INSERT INTO "agents" ("id", "company_id", "name", "role", "title", "icon", "status", "reports_to", "capabilities", "adapter_type", "adapter_config", "runtime_config", "budget_monthly_cents", "spent_monthly_cents", "permissions", "metadata", "agent_md", "created_at", "updated_at") VALUES ('017b9931-b2a8-47ce-a5dc-b5b703db9f94', '85b9dfd2-6c89-4676-8358-3cb2b6495f86', 'CEO', 'ceo', NULL, NULL, 'error', NULL, NULL, 'claude_local', '{"model": "claude-sonnet-4-6", "graceSec": 15, "timeoutSec": 0, "maxTurnsPerRun": 100, "instructionsFilePath": null, "instructionsRootPath": null, "instructionsEntryFile": "AGENTS.md", "instructionsBundleMode": "managed", "dangerouslySkipPermissions": true}'::jsonb, '{"heartbeat": {"enabled": true, "cooldownSec": 10, "intervalSec": 3600, "wakeOnDemand": true, "maxConcurrentRuns": 1}}'::jsonb, 0, 0, '{"canCreateAgents": true}'::jsonb, NULL, NULL, '2026-04-01T22:11:46.044094+00:00', '2026-04-09T14:56:49.018+00:00');
INSERT INTO "agents" ("id", "company_id", "name", "role", "title", "icon", "status", "reports_to", "capabilities", "adapter_type", "adapter_config", "runtime_config", "budget_monthly_cents", "spent_monthly_cents", "permissions", "metadata", "agent_md", "created_at", "updated_at") VALUES ('326a9040-177a-4ebe-9a2f-19c52d61b16b', '85b9dfd2-6c89-4676-8358-3cb2b6495f86', 'n8n Expert', 'engineer', 'Founding Engineer — n8n Automation', 'circuit-board', 'error', '017b9931-b2a8-47ce-a5dc-b5b703db9f94', 'Builds, debugs, and optimizes n8n workflows. Integrates external services (APIs, webhooks, databases). Validates and tests workflows. Maintains production automation systems.', 'claude_local', '{"cwd": null, "model": "claude-sonnet-4-6", "graceSec": 15, "timeoutSec": 0, "maxTurnsPerRun": 200, "paperclipSkillSync": {"desiredSkills": ["paperclipai/paperclip/paperclip", "paperclipai/paperclip/paperclip-create-agent", "paperclipai/paperclip/paperclip-create-plugin", "paperclipai/paperclip/para-memory-files"]}, "instructionsFilePath": null, "instructionsRootPath": null, "instructionsEntryFile": "AGENTS.md", "instructionsBundleMode": "managed", "dangerouslySkipPermissions": true}'::jsonb, '{"heartbeat": {"enabled": false, "intervalSec": 3600, "wakeOnDemand": true, "maxConcurrentRuns": 1}}'::jsonb, 0, 0, '{"canCreateAgents": false}'::jsonb, NULL, NULL, '2026-04-01T22:16:23.366548+00:00', '2026-04-06T01:20:44.727+00:00');
INSERT INTO "agents" ("id", "company_id", "name", "role", "title", "icon", "status", "reports_to", "capabilities", "adapter_type", "adapter_config", "runtime_config", "budget_monthly_cents", "spent_monthly_cents", "permissions", "metadata", "agent_md", "created_at", "updated_at") VALUES ('27fa3ed9-3dea-4dfa-8ab1-d934348b75c4', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'Git & CI/CD Engineer', 'engineer', 'Git & CI/CD Expert', 'git-branch', 'error', '87473cb4-1b22-41ac-9237-92756ce89cb3', 'Expert in git workflows (merges, rebasing, cherry-pick, stash, conflict resolution, history), CI/CD pipeline design and maintenance (GitHub Actions, automated deployments), and deployment strategies for already-released applications (zero-downtime, rollbacks, canary releases, feature flags).', 'claude_local', '{"model": "claude-sonnet-4-6", "graceSec": 15, "maxTurnsPerRun": 150, "instructionsFilePath": null, "instructionsRootPath": null, "instructionsEntryFile": "AGENTS.md", "instructionsBundleMode": "managed", "dangerouslySkipPermissions": true}'::jsonb, '{"heartbeat": {"enabled": false, "intervalSec": 3600, "wakeOnDemand": true, "maxConcurrentRuns": 1}, "executionTarget": "local_runner"}'::jsonb, 0, 0, '{"canCreateAgents": false}'::jsonb, NULL, NULL, '2026-04-01T22:20:27.687115+00:00', '2026-04-06T12:21:20.351+00:00');
INSERT INTO "agents" ("id", "company_id", "name", "role", "title", "icon", "status", "reports_to", "capabilities", "adapter_type", "adapter_config", "runtime_config", "budget_monthly_cents", "spent_monthly_cents", "permissions", "metadata", "agent_md", "created_at", "updated_at") VALUES ('986728e6-a51c-4002-b11b-a117df32a5ae', '85b9dfd2-6c89-4676-8358-3cb2b6495f86', 'n8n Workflow Engineer', 'engineer', 'Workflow Engineer — n8n Automation', 'zap', 'error', '017b9931-b2a8-47ce-a5dc-b5b703db9f94', 'Designs, builds, and deploys n8n workflows end-to-end. Manages workflow versioning, templates, and reusable sub-workflows. Handles node configuration, credential setup, and webhook integrations. Tests workflows before production deployment.', 'claude_local', '{"cwd": null, "model": "claude-haiku-4-5-20251001", "graceSec": 15, "timeoutSec": 0, "maxTurnsPerRun": 75, "paperclipSkillSync": {"desiredSkills": ["paperclipai/paperclip/paperclip", "paperclipai/paperclip/paperclip-create-agent", "paperclipai/paperclip/paperclip-create-plugin", "paperclipai/paperclip/para-memory-files"]}, "instructionsFilePath": null, "instructionsRootPath": null, "instructionsEntryFile": "AGENTS.md", "instructionsBundleMode": "managed", "dangerouslySkipPermissions": true}'::jsonb, '{"heartbeat": {"enabled": false, "intervalSec": 3600, "wakeOnDemand": true, "maxConcurrentRuns": 1}}'::jsonb, 0, 0, '{"canCreateAgents": false}'::jsonb, NULL, NULL, '2026-04-01T22:35:16.181516+00:00', '2026-04-06T01:20:44.217+00:00');
INSERT INTO "agents" ("id", "company_id", "name", "role", "title", "icon", "status", "reports_to", "capabilities", "adapter_type", "adapter_config", "runtime_config", "budget_monthly_cents", "spent_monthly_cents", "permissions", "metadata", "agent_md", "created_at", "updated_at") VALUES ('7e837cf1-88f6-47dd-8864-a50f24d20f87', '85b9dfd2-6c89-4676-8358-3cb2b6495f86', 'n8n Operations Engineer', 'engineer', 'Operations Engineer — n8n Automation', 'radar', 'error', '017b9931-b2a8-47ce-a5dc-b5b703db9f94', 'Monitors n8n workflow executions and identifies failures. Debugs broken workflows and fixes error states. Optimizes workflow performance and resource usage. Manages production incident response for automation pipelines.', 'claude_local', '{"cwd": null, "model": "claude-haiku-4-5-20251001", "graceSec": 15, "timeoutSec": 0, "maxTurnsPerRun": 75, "paperclipSkillSync": {"desiredSkills": ["paperclipai/paperclip/paperclip", "paperclipai/paperclip/paperclip-create-agent", "paperclipai/paperclip/paperclip-create-plugin", "paperclipai/paperclip/para-memory-files"]}, "instructionsFilePath": null, "instructionsRootPath": null, "instructionsEntryFile": "AGENTS.md", "instructionsBundleMode": "managed", "dangerouslySkipPermissions": true}'::jsonb, '{"heartbeat": {"enabled": false, "intervalSec": 3600, "wakeOnDemand": true, "maxConcurrentRuns": 1}}'::jsonb, 0, 0, '{"canCreateAgents": false}'::jsonb, NULL, NULL, '2026-04-01T22:35:20.696982+00:00', '2026-04-08T03:25:38.07+00:00');
INSERT INTO "agents" ("id", "company_id", "name", "role", "title", "icon", "status", "reports_to", "capabilities", "adapter_type", "adapter_config", "runtime_config", "budget_monthly_cents", "spent_monthly_cents", "permissions", "metadata", "agent_md", "created_at", "updated_at") VALUES ('7bbb4820-00b5-43d5-8bf3-61827e40205b', '85b9dfd2-6c89-4676-8358-3cb2b6495f86', 'Prompt Engineer', 'engineer', 'Prompt Engineer — AI Integrations', 'sparkles', 'error', '017b9931-b2a8-47ce-a5dc-b5b703db9f94', 'Designs and optimizes prompts for LLM nodes in n8n workflows. Builds AI-powered automation chains including classification, extraction, and generation. Integrates OpenAI, Anthropic, and other AI providers into production workflows. Tests prompt quality and handles edge cases in AI pipeline outputs.', 'claude_local', '{"cwd": null, "model": "claude-haiku-4-5-20251001", "graceSec": 15, "timeoutSec": 0, "maxTurnsPerRun": 75, "paperclipSkillSync": {"desiredSkills": ["paperclipai/paperclip/paperclip", "paperclipai/paperclip/paperclip-create-agent", "paperclipai/paperclip/paperclip-create-plugin", "paperclipai/paperclip/para-memory-files"]}, "instructionsFilePath": null, "instructionsRootPath": null, "instructionsEntryFile": "AGENTS.md", "instructionsBundleMode": "managed", "dangerouslySkipPermissions": true}'::jsonb, '{"heartbeat": {"enabled": false, "intervalSec": 3600, "wakeOnDemand": true, "maxConcurrentRuns": 1}}'::jsonb, 0, 0, '{"canCreateAgents": false}'::jsonb, NULL, NULL, '2026-04-01T22:35:25.587314+00:00', '2026-04-06T01:20:44.658+00:00');
INSERT INTO "agents" ("id", "company_id", "name", "role", "title", "icon", "status", "reports_to", "capabilities", "adapter_type", "adapter_config", "runtime_config", "budget_monthly_cents", "spent_monthly_cents", "permissions", "metadata", "agent_md", "created_at", "updated_at") VALUES ('5bce5e22-7238-4114-8f12-35d63ec54e54', 'aa76d3cd-4273-4443-83c8-70931173e770', 'CEO', 'ceo', NULL, NULL, 'idle', NULL, NULL, 'claude_local', '{"model": "claude-sonnet-4-6", "graceSec": 15, "timeoutSec": 0, "maxTurnsPerRun": 40, "instructionsFilePath": null, "instructionsRootPath": null, "instructionsEntryFile": "AGENTS.md", "instructionsBundleMode": "managed", "dangerouslySkipPermissions": true}'::jsonb, '{"heartbeat": {"enabled": false, "cooldownSec": 10, "intervalSec": 14400, "wakeOnDemand": true, "maxConcurrentRuns": 1}, "executionTarget": "local_runner"}'::jsonb, 0, 0, '{"canCreateAgents": true}'::jsonb, NULL, NULL, '2026-04-02T03:16:39.149293+00:00', '2026-04-08T04:31:41.574+00:00');
INSERT INTO "agents" ("id", "company_id", "name", "role", "title", "icon", "status", "reports_to", "capabilities", "adapter_type", "adapter_config", "runtime_config", "budget_monthly_cents", "spent_monthly_cents", "permissions", "metadata", "agent_md", "created_at", "updated_at") VALUES ('45f673ac-67e0-4d39-b461-91d4f62a7e90', 'aa76d3cd-4273-4443-83c8-70931173e770', 'Orchestrator', 'engineer', 'Gestor Orchestrator — Lead Engineer', 'brain', 'error', '5bce5e22-7238-4114-8f12-35d63ec54e54', 'Central coordinator for Gestor de Vinotecas. Analyzes requests, defines operation mode (LECTURA/PLANIFICACION/IMPLEMENTACION/DEBUG/AUDITORIA), and dispatches specialist agents. Single point of entry for all engineering work.', 'claude_local', '{"cwd": null, "model": "claude-sonnet-4-6", "maxTurnsPerRun": 60, "instructionsFilePath": null, "instructionsRootPath": null, "instructionsEntryFile": "gestor-orchestrator.md", "instructionsBundleMode": "external", "dangerouslySkipPermissions": true}'::jsonb, '{"heartbeat": {"enabled": false, "intervalSec": 14400, "wakeOnDemand": true, "maxConcurrentRuns": 1}, "executionTarget": "local_runner"}'::jsonb, 0, 0, '{"canCreateAgents": false}'::jsonb, NULL, NULL, '2026-04-02T03:20:08.207516+00:00', '2026-04-06T13:43:43.244+00:00');
INSERT INTO "agents" ("id", "company_id", "name", "role", "title", "icon", "status", "reports_to", "capabilities", "adapter_type", "adapter_config", "runtime_config", "budget_monthly_cents", "spent_monthly_cents", "permissions", "metadata", "agent_md", "created_at", "updated_at") VALUES ('fd0af5a8-0f87-4d04-91b1-234bfbdb0ff4', 'aa76d3cd-4273-4443-83c8-70931173e770', 'BackendArchitect', 'engineer', 'Backend Architect — Express + Prisma + Zod', 'code', 'error', '45f673ac-67e0-4d39-b461-91d4f62a7e90', 'Designs and implements Express 5 services, middleware, cache strategies, and multi-tenant API endpoints for Gestor de Vinotecas. Expert in Prisma, Zod, JWT, RBAC, and N+1 prevention.', 'claude_local', '{"cwd": null, "model": "claude-sonnet-4-6", "maxTurnsPerRun": 80, "instructionsFilePath": null, "instructionsRootPath": null, "instructionsEntryFile": "gestor-backend-architect.md", "instructionsBundleMode": "external", "dangerouslySkipPermissions": true}'::jsonb, '{"heartbeat": {"enabled": false, "intervalSec": 86400, "wakeOnDemand": true, "maxConcurrentRuns": 1}, "executionTarget": "local_runner"}'::jsonb, 0, 0, '{"canCreateAgents": false}'::jsonb, NULL, NULL, '2026-04-02T03:20:26.403726+00:00', '2026-04-06T13:44:06.723+00:00');
INSERT INTO "agents" ("id", "company_id", "name", "role", "title", "icon", "status", "reports_to", "capabilities", "adapter_type", "adapter_config", "runtime_config", "budget_monthly_cents", "spent_monthly_cents", "permissions", "metadata", "agent_md", "created_at", "updated_at") VALUES ('50953961-cdd2-4e66-b5dd-271b26fb6347', 'aa76d3cd-4273-4443-83c8-70931173e770', 'BackendPlanner', 'pm', 'Backend Planner — Strategic Implementation Planning', 'target', 'error', '45f673ac-67e0-4d39-b461-91d4f62a7e90', 'Strategic planner for backend implementations. Reads real code, produces detailed plans with SQL for review, implementation sequences, and risk analysis. NEVER executes migrations without approval.', 'claude_local', '{"cwd": null, "model": "claude-sonnet-4-6", "maxTurnsPerRun": 60, "instructionsFilePath": null, "instructionsRootPath": null, "instructionsEntryFile": "gestor-backend-planner.md", "instructionsBundleMode": "external", "dangerouslySkipPermissions": true}'::jsonb, '{"heartbeat": {"enabled": false, "intervalSec": 86400, "wakeOnDemand": true, "maxConcurrentRuns": 1}, "executionTarget": "local_runner"}'::jsonb, 0, 0, '{"canCreateAgents": false}'::jsonb, NULL, NULL, '2026-04-02T03:20:32.11554+00:00', '2026-04-06T13:44:19.657+00:00');
INSERT INTO "agents" ("id", "company_id", "name", "role", "title", "icon", "status", "reports_to", "capabilities", "adapter_type", "adapter_config", "runtime_config", "budget_monthly_cents", "spent_monthly_cents", "permissions", "metadata", "agent_md", "created_at", "updated_at") VALUES ('aabf3f57-5130-40cf-82c5-6c25c1fdaddc', 'aa76d3cd-4273-4443-83c8-70931173e770', 'DBArchitect', 'engineer', 'DB Architect — PostgreSQL + Supabase + Prisma', 'database', 'error', '45f673ac-67e0-4d39-b461-91d4f62a7e90', 'Designs multi-tenant schemas, optimizes queries, writes SQL migrations for manual review. Expert in PostgreSQL, Supabase, Prisma, FIFO allocation, EXPLAIN ANALYZE, and index strategy.', 'claude_local', '{"cwd": null, "model": "claude-sonnet-4-6", "maxTurnsPerRun": 80, "instructionsFilePath": null, "instructionsRootPath": null, "instructionsEntryFile": "gestor-db-architect.md", "instructionsBundleMode": "external", "dangerouslySkipPermissions": true}'::jsonb, '{"heartbeat": {"enabled": false, "intervalSec": 86400, "wakeOnDemand": true, "maxConcurrentRuns": 1}, "executionTarget": "local_runner"}'::jsonb, 0, 0, '{"canCreateAgents": false}'::jsonb, NULL, NULL, '2026-04-02T03:20:36.17552+00:00', '2026-04-06T13:44:38.739+00:00');
INSERT INTO "agents" ("id", "company_id", "name", "role", "title", "icon", "status", "reports_to", "capabilities", "adapter_type", "adapter_config", "runtime_config", "budget_monthly_cents", "spent_monthly_cents", "permissions", "metadata", "agent_md", "created_at", "updated_at") VALUES ('6b7d8720-1771-4aae-900e-6161522aab5c', 'aa76d3cd-4273-4443-83c8-70931173e770', 'FrontendPlanner', 'pm', 'Frontend Planner — React MFE Planning', 'puzzle', 'error', '45f673ac-67e0-4d39-b461-91d4f62a7e90', 'Strategic planner for React 19 + Module Federation frontends. Reads real code, produces detailed plans for components, hooks, React Query, and TypeScript changes.', 'claude_local', '{"cwd": null, "model": "claude-sonnet-4-6", "maxTurnsPerRun": 60, "instructionsFilePath": null, "instructionsRootPath": null, "instructionsEntryFile": "gestor-frontend-planner.md", "instructionsBundleMode": "external", "dangerouslySkipPermissions": true}'::jsonb, '{"heartbeat": {"enabled": false, "intervalSec": 86400, "wakeOnDemand": true, "maxConcurrentRuns": 1}, "executionTarget": "local_runner"}'::jsonb, 0, 0, '{"canCreateAgents": false}'::jsonb, NULL, NULL, '2026-04-02T03:20:40.880746+00:00', '2026-04-06T13:46:00.468+00:00');
INSERT INTO "agents" ("id", "company_id", "name", "role", "title", "icon", "status", "reports_to", "capabilities", "adapter_type", "adapter_config", "runtime_config", "budget_monthly_cents", "spent_monthly_cents", "permissions", "metadata", "agent_md", "created_at", "updated_at") VALUES ('8eb920fe-884c-4156-b2fe-7268e2f4985f', 'aa76d3cd-4273-4443-83c8-70931173e770', 'MFEArchitect', 'engineer', 'MFE Architect — Module Federation + Webpack', 'hexagon', 'error', '45f673ac-67e0-4d39-b461-91d4f62a7e90', 'Designs microfrontend architecture with @module-federation/enhanced. Handles shared deps, CSS isolation, Shell + 10 MFE remotes, and independent deploy strategies.', 'claude_local', '{"cwd": null, "model": "claude-sonnet-4-6", "maxTurnsPerRun": 80, "instructionsFilePath": null, "instructionsRootPath": null, "instructionsEntryFile": "gestor-mfe-architect.md", "instructionsBundleMode": "external", "dangerouslySkipPermissions": true}'::jsonb, '{"heartbeat": {"enabled": false, "intervalSec": 86400, "wakeOnDemand": true, "maxConcurrentRuns": 1}, "executionTarget": "local_runner"}'::jsonb, 0, 0, '{"canCreateAgents": false}'::jsonb, NULL, NULL, '2026-04-02T03:20:45.434582+00:00', '2026-04-06T13:46:46.655+00:00');
INSERT INTO "agents" ("id", "company_id", "name", "role", "title", "icon", "status", "reports_to", "capabilities", "adapter_type", "adapter_config", "runtime_config", "budget_monthly_cents", "spent_monthly_cents", "permissions", "metadata", "agent_md", "created_at", "updated_at") VALUES ('c2f3bcdc-196b-492e-93c2-46e7e6c3d3be', 'aa76d3cd-4273-4443-83c8-70931173e770', 'SecurityEngineer', 'engineer', 'Security Engineer — OWASP + JWT + RBAC', 'shield', 'error', '45f673ac-67e0-4d39-b461-91d4f62a7e90', 'Integral security specialist for Gestor de Vinotecas. Audits frontend + backend + DB + multi-tenancy. Expert in JWT, OWASP Top 10, RBAC, Express middleware security, and multi-tenant isolation.', 'claude_local', '{"cwd": null, "model": "claude-sonnet-4-6", "maxTurnsPerRun": 80, "instructionsFilePath": null, "instructionsRootPath": null, "instructionsEntryFile": "gestor-security.md", "instructionsBundleMode": "external", "dangerouslySkipPermissions": true}'::jsonb, '{"heartbeat": {"enabled": false, "intervalSec": 86400, "wakeOnDemand": true, "maxConcurrentRuns": 1}, "executionTarget": "local_runner"}'::jsonb, 0, 0, '{"canCreateAgents": false}'::jsonb, NULL, NULL, '2026-04-02T03:20:52.088225+00:00', '2026-04-06T13:49:17.651+00:00');
INSERT INTO "agents" ("id", "company_id", "name", "role", "title", "icon", "status", "reports_to", "capabilities", "adapter_type", "adapter_config", "runtime_config", "budget_monthly_cents", "spent_monthly_cents", "permissions", "metadata", "agent_md", "created_at", "updated_at") VALUES ('c4f12073-b2b2-4e0d-81dd-81d7fa182480', 'aa76d3cd-4273-4443-83c8-70931173e770', 'QATester', 'qa', 'QA Tester — Jest + Supertest + E2E', 'bug', 'error', '45f673ac-67e0-4d39-b461-91d4f62a7e90', 'Full QA for Express + Prisma backend and React MFE frontend. Writes and runs unit, integration, and E2E tests. Expert in Jest, Supertest, multi-tenant test isolation, and coverage analysis.', 'claude_local', '{"cwd": null, "model": "claude-sonnet-4-6", "maxTurnsPerRun": 80, "instructionsFilePath": null, "instructionsRootPath": null, "instructionsEntryFile": "gestor-tester.md", "instructionsBundleMode": "external", "dangerouslySkipPermissions": true}'::jsonb, '{"heartbeat": {"enabled": false, "intervalSec": 86400, "wakeOnDemand": true, "maxConcurrentRuns": 1}, "executionTarget": "local_runner"}'::jsonb, 0, 0, '{"canCreateAgents": false}'::jsonb, NULL, NULL, '2026-04-02T03:20:55.385216+00:00', '2026-04-06T13:48:50.119+00:00');
INSERT INTO "agents" ("id", "company_id", "name", "role", "title", "icon", "status", "reports_to", "capabilities", "adapter_type", "adapter_config", "runtime_config", "budget_monthly_cents", "spent_monthly_cents", "permissions", "metadata", "agent_md", "created_at", "updated_at") VALUES ('4c1a5377-93e5-4c99-bfe9-164217f9c592', 'aa76d3cd-4273-4443-83c8-70931173e770', 'UXUIDesigner', 'designer', 'UX/UI Designer — React + Tailwind + Design System', 'sparkles', 'error', '45f673ac-67e0-4d39-b461-91d4f62a7e90', 'UX/UI expert + frontend implementation for Gestor de Vinotecas. Combines evidence-based design with React 19 + TypeScript + @gestor/ui + TailwindCSS. Desktop-first, premium wine industry aesthetic.', 'claude_local', '{"cwd": null, "model": "claude-sonnet-4-6", "maxTurnsPerRun": 80, "instructionsFilePath": null, "instructionsRootPath": null, "instructionsEntryFile": "gestor-ux-ui.md", "instructionsBundleMode": "external", "dangerouslySkipPermissions": true}'::jsonb, '{"heartbeat": {"enabled": false, "intervalSec": 86400, "wakeOnDemand": true, "maxConcurrentRuns": 1}, "executionTarget": "local_runner"}'::jsonb, 0, 0, '{"canCreateAgents": false}'::jsonb, NULL, NULL, '2026-04-02T03:21:00.145387+00:00', '2026-04-06T13:49:30.247+00:00');
INSERT INTO "agents" ("id", "company_id", "name", "role", "title", "icon", "status", "reports_to", "capabilities", "adapter_type", "adapter_config", "runtime_config", "budget_monthly_cents", "spent_monthly_cents", "permissions", "metadata", "agent_md", "created_at", "updated_at") VALUES ('d4f5484f-6fb0-4c93-9077-68b54543f28a', 'aa76d3cd-4273-4443-83c8-70931173e770', 'DiagramArchitect', 'engineer', 'Diagram Architect — Mermaid + PlantUML + ASCII', 'git-branch', 'error', '45f673ac-67e0-4d39-b461-91d4f62a7e90', 'Creates technical diagrams in multiple formats (ASCII, Mermaid, PlantUML, Draw.io). Specializes in architecture diagrams, ERDs from Prisma schema, sequence diagrams, state machines, and MFE topology.', 'claude_local', '{"cwd": null, "model": "claude-haiku-4-5-20251001", "maxTurnsPerRun": 40, "instructionsFilePath": null, "instructionsRootPath": null, "instructionsEntryFile": "diagram-architect.md", "instructionsBundleMode": "external", "dangerouslySkipPermissions": true}'::jsonb, '{"heartbeat": {"enabled": false, "intervalSec": 86400, "wakeOnDemand": true, "maxConcurrentRuns": 1}, "executionTarget": "local_runner"}'::jsonb, 0, 0, '{"canCreateAgents": false}'::jsonb, NULL, NULL, '2026-04-02T03:21:05.403334+00:00', '2026-04-06T13:44:56.716+00:00');
INSERT INTO "agents" ("id", "company_id", "name", "role", "title", "icon", "status", "reports_to", "capabilities", "adapter_type", "adapter_config", "runtime_config", "budget_monthly_cents", "spent_monthly_cents", "permissions", "metadata", "agent_md", "created_at", "updated_at") VALUES ('4d8c1246-b3dd-4bef-9c5d-c7cb5560ceca', 'aa76d3cd-4273-4443-83c8-70931173e770', 'DocsEngineer', 'researcher', 'Documentation Engineer — API Docs + Architecture', 'file-code', 'error', '45f673ac-67e0-4d39-b461-91d4f62a7e90', 'Documentation system architect. Creates and maintains OpenAPI specs, architecture guides, ADRs, onboarding docs, and READMEs for Gestor de Vinotecas.', 'claude_local', '{"cwd": null, "model": "claude-haiku-4-5-20251001", "maxTurnsPerRun": 40, "instructionsFilePath": null, "instructionsRootPath": null, "instructionsEntryFile": "documentation-engineer.md", "instructionsBundleMode": "external", "dangerouslySkipPermissions": true}'::jsonb, '{"heartbeat": {"enabled": false, "intervalSec": 86400, "wakeOnDemand": true, "maxConcurrentRuns": 1}, "executionTarget": "local_runner"}'::jsonb, 0, 0, '{"canCreateAgents": false}'::jsonb, NULL, NULL, '2026-04-02T03:21:09.774976+00:00', '2026-04-06T13:45:37.222+00:00');
INSERT INTO "agents" ("id", "company_id", "name", "role", "title", "icon", "status", "reports_to", "capabilities", "adapter_type", "adapter_config", "runtime_config", "budget_monthly_cents", "spent_monthly_cents", "permissions", "metadata", "agent_md", "created_at", "updated_at") VALUES ('a8d2aac9-6163-415b-a2f1-18b073ae8456', 'aa76d3cd-4273-4443-83c8-70931173e770', 'PenTester', 'engineer', 'Penetration Tester — Authorized Security Testing', 'swords', 'error', '45f673ac-67e0-4d39-b461-91d4f62a7e90', 'Authorized penetration testing specialist. Conducts offensive security tests against Gestor de Vinotecas (auth bypass, IDOR, injection, multi-tenant isolation). Only against explicitly authorized targets.', 'claude_local', '{"cwd": null, "model": "claude-sonnet-4-6", "maxTurnsPerRun": 60, "instructionsFilePath": null, "instructionsRootPath": null, "instructionsEntryFile": "penetration-tester.md", "instructionsBundleMode": "external", "dangerouslySkipPermissions": true}'::jsonb, '{"heartbeat": {"enabled": false, "intervalSec": 86400, "wakeOnDemand": true, "maxConcurrentRuns": 1}, "executionTarget": "local_runner"}'::jsonb, 0, 0, '{"canCreateAgents": false}'::jsonb, NULL, NULL, '2026-04-02T03:21:14.769549+00:00', '2026-04-06T13:46:59.514+00:00');
INSERT INTO "agents" ("id", "company_id", "name", "role", "title", "icon", "status", "reports_to", "capabilities", "adapter_type", "adapter_config", "runtime_config", "budget_monthly_cents", "spent_monthly_cents", "permissions", "metadata", "agent_md", "created_at", "updated_at") VALUES ('38d47c16-ec71-4f44-9e0a-84b167cf16f7', 'aa76d3cd-4273-4443-83c8-70931173e770', 'PerformanceEngineer', 'engineer', 'Performance Engineer — Profiling + Optimization', 'zap', 'error', '45f673ac-67e0-4d39-b461-91d4f62a7e90', 'Profiles and optimizes Gestor de Vinotecas stack. Expert in API response times, Prisma query optimization, Module Federation bundle analysis, React render performance, and load testing.', 'claude_local', '{"cwd": null, "model": "claude-sonnet-4-6", "maxTurnsPerRun": 60, "instructionsFilePath": null, "instructionsRootPath": null, "instructionsEntryFile": "performance-engineer.md", "instructionsBundleMode": "external", "dangerouslySkipPermissions": true}'::jsonb, '{"heartbeat": {"enabled": false, "intervalSec": 86400, "wakeOnDemand": true, "maxConcurrentRuns": 1}, "executionTarget": "local_runner"}'::jsonb, 0, 0, '{"canCreateAgents": false}'::jsonb, NULL, NULL, '2026-04-02T03:21:19.291636+00:00', '2026-04-06T13:48:06.365+00:00');
INSERT INTO "agents" ("id", "company_id", "name", "role", "title", "icon", "status", "reports_to", "capabilities", "adapter_type", "adapter_config", "runtime_config", "budget_monthly_cents", "spent_monthly_cents", "permissions", "metadata", "agent_md", "created_at", "updated_at") VALUES ('36a8c34d-25ad-4b0c-950d-953e16c776e7', 'aa76d3cd-4273-4443-83c8-70931173e770', 'PromptEngineer', 'researcher', 'Prompt Engineer — LLM Optimization + AI Features', 'wand', 'error', '45f673ac-67e0-4d39-b461-91d4f62a7e90', 'Prompt engineering specialist for LLM optimization, prompt design patterns (zero-shot, few-shot, CoT, ReAct), structured outputs, AI feature development, and token efficiency.', 'claude_local', '{"cwd": null, "model": "claude-sonnet-4-6", "maxTurnsPerRun": 50, "instructionsFilePath": null, "instructionsRootPath": null, "instructionsEntryFile": "prompt-engineer.md", "instructionsBundleMode": "external", "dangerouslySkipPermissions": true}'::jsonb, '{"heartbeat": {"enabled": false, "intervalSec": 86400, "wakeOnDemand": true, "maxConcurrentRuns": 1}, "executionTarget": "local_runner"}'::jsonb, 0, 0, '{"canCreateAgents": false}'::jsonb, NULL, NULL, '2026-04-02T03:21:24.173848+00:00', '2026-04-06T13:48:36.228+00:00');

-- Goals
INSERT INTO "goals" ("id", "company_id", "title", "description", "level", "status", "parent_id", "owner_agent_id", "created_at", "updated_at") VALUES ('ddcd9ac6-a278-4fe1-b8d8-53bd320f23b8', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'Creamos soluciones tecnológicas para empresas que no tienen tiempo que perder. Desde automatizaciones inteligentes que eliminan tareas manuales, hasta desarrollo de software (a medida o genérico) diseñado para optimizar tu operación.', NULL, 'company', 'active', NULL, NULL, '2026-04-01T19:32:30.354464+00:00', '2026-04-01T19:32:30.354464+00:00');

-- Projects
INSERT INTO "projects" ("id", "company_id", "goal_id", "name", "description", "status", "lead_agent_id", "target_date", "color", "claude_md", "ai_context", "created_at", "updated_at") VALUES ('bf8dadb4-f499-4cd2-aa30-ac61ef5bad89', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'ddcd9ac6-a278-4fe1-b8d8-53bd320f23b8', 'Onboarding', NULL, 'in_progress', NULL, NULL, '#6366f1', NULL, NULL, '2026-04-01T19:33:45.016228+00:00', '2026-04-01T19:36:56.609+00:00');
INSERT INTO "projects" ("id", "company_id", "goal_id", "name", "description", "status", "lead_agent_id", "target_date", "color", "claude_md", "ai_context", "created_at", "updated_at") VALUES ('c574ac5d-ee99-49a5-a02a-298f74eb1dce', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', NULL, 'Paco', NULL, 'planned', NULL, NULL, '#06b6d4', NULL, NULL, '2026-04-01T19:38:53.15942+00:00', '2026-04-01T22:13:29.385+00:00');
INSERT INTO "projects" ("id", "company_id", "goal_id", "name", "description", "status", "lead_agent_id", "target_date", "color", "claude_md", "ai_context", "created_at", "updated_at") VALUES ('0b4583ca-b268-4d77-8a36-32f3b8de504b', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', NULL, 'Hitt Estate', NULL, 'planned', NULL, NULL, '#14b8a6', '# Project: AppMinuta

## OBLIGATORIO
 - Utiliza siempre el agente appminuta-oschetrator.md y sus sub agentes. 
 - seguir siempre el git Workflow

# Git Workflow — Paperclip

## Branch structure (Gitflow)

```
Master  ──── v1.0 ──────────── v1.1 ──────────────────────────── v1.2
               ↑                 ↑                                  ↑
Hotfix         └─── (fix) ───────┘                                  │
                         ↘                                          │
Developer ───────────────────────────────────────── Release ────────┘
               ↑               ↑          ↑
Feature        └── commit ── commit ──────┘
```

- **master** — production. Only receives merges from `hotfix` or `release`.
- **developer** — main integration branch. All new work lands here.
- **feature/...** — work branches, created from `developer` and merged back to `developer`.
- **release/...** — cut from `developer` when features are ready, merges into `master` (with version tag) and back into `developer`.
- **hotfix/...** — cut from `master` for urgent fixes, merges into `master` AND `developer`.

---

## Workflow when receiving tickets

1. Group related tickets into a single feature.
2. Create branch from `developer`:
   ```
   Feature/(ticket-name-or-names)
   ```
3. Work on the feature branch with atomic commits.
4. When opening a PR to `developer`, the merge commit must follow this format:
   ```
   Feature/(branch-name): brief description
   ```

---

## Commit and PR rules

- **Commits on feature branches**: descriptive, lowercase, format `type: description`
- **Merge to developer**: `Feature/(branch-name): brief description`
- **Merge to master**: only from `release/x.x.x` or `hotfix/...`
- Never commit directly to `master` or `developer`

---

## Branching decision rule (MANDATORY — apply automatically)

When the user asks me to implement or fix something, I must pick the branch type **before writing any code**:

| Change type | Branch from | PR target | Branch name format |
|---|---|---|---|
| New feature / non-trivial work | `developer` | `developer` | `feature/(description)` |
| Minimal fix / hotfix (1-3 files, no new features) | `master` | `master` | `hotfix/(description)` |

- After committing, **always push the branch and open a GitHub PR** in the same step.
- PR title format: `hotfix/(branch-name): brief description` or `Feature/(branch-name): brief description`.
- Do not ask the user which type to use — infer it from the scope of the change.


## Tech Stack
- **Backend**: NestJS + TypeScript + Prisma ORM
- **Frontend**: React 18 + TypeScript + Vite + TanStack Query
- **MV (Mapa de Venta)**: Microfrontend React — `MV/src/`
- **Base de Datos**: Supabase Self-Hosted (PostgreSQL 17)
- **Cache**: node-cache (L1) + Redis (L2) via `@Cacheable` decorator
- **Queues**: Bull + Redis (PDF, Excel import, notifications)
- **Real-time**: Socket.IO WebSocket (`/ws/unidades`)
- **Module Federation**: `@originjs/vite-plugin-federation`
- **Deploy**: Docker + Portainer en VPS self-hosted

## Architecture
```
backend/src/
  auth/          — Supabase auth guards, JWT, session cache
  shared/        — Unidades, Proyectos, Permisos (core)
  mapaVenta/     — Catálogos MV: edificios, etapas, comerciales, snapshots, pisada, titulares
  minutas/       — Generación de minutas (async via Bull queue)
  uif/           — Módulo UIF (documents, analyses, clients)
  common/        — Cache decorators, pipes, interceptors
  prisma/        — Prisma service + schema

MV/src/
  pages/         — SalesMapView (vista principal), UnitsListPage
  components/    — unit-table, unit-filters, unit-detail-sheet, export/, formula/, modals/
  hooks/         — useUnits, useFormulaSocket, useProjectParametros, useSalesMap
  services/      — supabaseService (data layer), backendAPI (HTTP client)
  types/         — Unit, UnitFilters, UnitStatus

frontend/src/    — App principal (minutas, configuración)
apps/shell/      — Nginx shell para Module Federation
```

## Conventions
- TypeScript estricto, no usar `any`
- Preferir editar archivos existentes sobre crear nuevos
- Cambios mínimos y focalizados — no tocar lo que no se pidió
- No agregar comentarios obvios ni documentación innecesaria
- Validar inputs en boundaries del sistema (DTOs, API endpoints)
- Conventional commits: `feat()`, `fix()`, `refactor()`, `perf()`



> IMPORTANTE: Nunca dejar commits sin pushear. Si el push falla, reportarlo explícitamente.

## Testing
- **Unit tests** → corren en CI (GitHub Actions) en cada push. No necesitan infraestructura.
- **E2E tests** → correr LOCAL (`npm run test:e2e` desde `backend/`) antes de pushear cuando toca flujos críticos: auth, minutas, permisos, guards
- E2E **no corren en CI** — requieren DB + Redis + Supabase
- Recordar al usuario correr E2E local si el cambio lo amerita antes de push

## Security & Compliance
- NUNCA commitear `.env` con secretos — solo `.env.example` va a git
- Archivos `.env` locales están en `.gitignore`
- Secretos de CI/CD están en GitHub Actions Secrets
- NUNCA ejecutar migraciones de BD automáticamente — mostrar SQL al usuario primero

## Workflow: Analizar → Planificar → Aprobar → Ejecutar → Validar

### 1. Análisis Profundo
- Leer TODOS los archivos involucrados, no asumir nada
- Entender dependencias, side effects y flujo de datos completo
- Identificar riesgos, edge cases y puntos de fallo
- Si hay ambiguedad, preguntar ANTES de planificar

### 2. Plan Detallado
- Presentar plan estructurado con:
  - **Diagnóstico**: Qué está pasando y por qué
  - **Archivos afectados**: Lista exacta a crear/modificar/eliminar
  - **Cambios propuestos**: Descripción concreta (no genérica)
  - **Riesgos**: Qué podría salir mal y cómo se mitiga
  - **Validación**: Cómo se va a demostrar que funciona
- Usar `tasks/todo.md` para trackear items con checkboxes

### 3. Aprobación
- **NUNCA ejecutar sin "dale"/"ok"/"hacé" explícito del usuario**
- Si pide ajustes → replanificar y volver a presentar

### 4. Ejecución
- Seguir el plan aprobado al pie de la letra
- Si surge algo inesperado, PARAR y consultar
- No agregar "mejoras" ni refactors fuera del plan
- Marcar progreso en `tasks/todo.md` a medida que se avanza

### 5. Validación E2E
- **Obligatorio demostrar que funciona**. Formas válidas:
  - Correr tests existentes y mostrar que pasan
  - Ejecutar servidor/build y mostrar output exitoso
  - Hacer requests reales (curl, API calls) y mostrar responses
  - Mostrar logs que confirmen el comportamiento esperado
  - Si es BD: ejecutar queries que prueben los datos
- Si falla → arreglar y re-validar sin preguntar
- **No declarar "listo" sin evidencia concreta**

### Modo Autónomo
Cuando el usuario dice "ejecuta sin preguntar" o "modo autónomo":
- Análisis profundo igual (nunca saltear)
- Ejecutar directamente sin esperar aprobación
- Validación E2E sigue siendo obligatoria
- Reportar al final: qué se hizo, qué cambió, evidencia de que funciona

## Review Checklist
- [ ] TypeScript compila sin errores nuevos
- [ ] No se introdujeron `any`
- [ ] No se rompió funcionalidad existente
- [ ] Cambios son mínimos y focalizados al pedido
- [ ] Si toca BD: SQL revisado por el usuario antes de ejecutar
', NULL, '2026-04-01T21:08:46.608057+00:00', '2026-04-09T14:21:56.521+00:00');
INSERT INTO "projects" ("id", "company_id", "goal_id", "name", "description", "status", "lead_agent_id", "target_date", "color", "claude_md", "ai_context", "created_at", "updated_at") VALUES ('7cb3eee5-3439-493f-b777-155a75c5e55e', '85b9dfd2-6c89-4676-8358-3cb2b6495f86', NULL, 'Onboarding', NULL, 'in_progress', NULL, NULL, '#6366f1', NULL, NULL, '2026-04-01T22:12:48.547289+00:00', '2026-04-01T22:12:48.547289+00:00');
INSERT INTO "projects" ("id", "company_id", "goal_id", "name", "description", "status", "lead_agent_id", "target_date", "color", "claude_md", "ai_context", "created_at", "updated_at") VALUES ('3d0a31ad-0e0a-4165-8ea0-5809c2eb0b50', '85b9dfd2-6c89-4676-8358-3cb2b6495f86', NULL, 'Automatizaciones', 'n8n-powered AI automation workflows for clients. Current client: Gonzalo Guinazu Inmobiliaria (WhatsApp bot + RAG pipeline + property sync + lead scraping).', 'in_progress', NULL, NULL, '#8b5cf6', NULL, NULL, '2026-04-01T22:15:04.512888+00:00', '2026-04-01T22:15:04.512888+00:00');
INSERT INTO "projects" ("id", "company_id", "goal_id", "name", "description", "status", "lead_agent_id", "target_date", "color", "claude_md", "ai_context", "created_at", "updated_at") VALUES ('799311f2-18b2-49f6-9268-b192350d1291', 'aa76d3cd-4273-4443-83c8-70931173e770', NULL, 'Onboarding', NULL, 'in_progress', NULL, NULL, '#6366f1', NULL, NULL, '2026-04-02T03:17:42.13236+00:00', '2026-04-02T03:17:42.13236+00:00');
INSERT INTO "projects" ("id", "company_id", "goal_id", "name", "description", "status", "lead_agent_id", "target_date", "color", "claude_md", "ai_context", "created_at", "updated_at") VALUES ('c9b531a8-d1b9-413a-9ac7-7914fd20be06', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', NULL, 'Hitt Buyer', NULL, 'planned', NULL, NULL, '#06b6d4', NULL, NULL, '2026-04-08T12:33:31.577465+00:00', '2026-04-08T12:33:31.577465+00:00');

-- Issues
INSERT INTO "issues" ("id", "company_id", "project_id", "goal_id", "parent_id", "title", "description", "status", "priority", "assignee_agent_id", "assignee_user_id", "created_by_agent_id", "created_by_user_id", "issue_number", "identifier", "origin_kind", "sprint_id", "started_at", "completed_at", "cancelled_at", "created_at", "updated_at") VALUES ('306ecc73-e34d-489a-8f2f-34e1965aeb03', '85b9dfd2-6c89-4676-8358-3cb2b6495f86', '7cb3eee5-3439-493f-b777-155a75c5e55e', NULL, NULL, 'Hire your first engineer and create a hiring plan  aca esta el path de la carpeta que utilizaras /Users/pacosemino/Desktop/Automatizaciones', 'You are the CEO. You set the direction for the company.

- hire a founding engineer
- write a hiring plan
- break the roadmap into concrete tasks and start delegating work

aca esta el path de la carpeta que utilizaras /Users/pacosemino/Desktop/Automatizaciones', 'done', 'medium', '017b9931-b2a8-47ce-a5dc-b5b703db9f94', NULL, NULL, '4232cc3dfbe2c47fccfc888c9754a879', 1, 'PACA-1', 'manual', NULL, '2026-04-01T22:13:44.127+00:00', '2026-04-01T22:38:15.753+00:00', NULL, '2026-04-01T22:12:48.557959+00:00', '2026-04-01T22:55:43.219+00:00');
INSERT INTO "issues" ("id", "company_id", "project_id", "goal_id", "parent_id", "title", "description", "status", "priority", "assignee_agent_id", "assignee_user_id", "created_by_agent_id", "created_by_user_id", "issue_number", "identifier", "origin_kind", "sprint_id", "started_at", "completed_at", "cancelled_at", "created_at", "updated_at") VALUES ('89a732a0-b685-4793-a937-f8e74e3c2279', 'aa76d3cd-4273-4443-83c8-70931173e770', '799311f2-18b2-49f6-9268-b192350d1291', NULL, NULL, 'Hire your first engineer and create a hiring plan', 'You are the CEO. You set the direction for the company.

- hire a founding engineer
- write a hiring plan
- break the roadmap into concrete tasks and start delegating work

hire one subagente para cada /Users/pacosemino/Desktop/Gestor/.claude/agents', 'done', 'medium', '5bce5e22-7238-4114-8f12-35d63ec54e54', NULL, NULL, '4232cc3dfbe2c47fccfc888c9754a879', 1, 'VIN-1', 'manual', NULL, '2026-04-02T03:19:00.917+00:00', '2026-04-02T03:22:16.151+00:00', NULL, '2026-04-02T03:17:42.146544+00:00', '2026-04-02T03:33:55.358+00:00');
INSERT INTO "issues" ("id", "company_id", "project_id", "goal_id", "parent_id", "title", "description", "status", "priority", "assignee_agent_id", "assignee_user_id", "created_by_agent_id", "created_by_user_id", "issue_number", "identifier", "origin_kind", "sprint_id", "started_at", "completed_at", "cancelled_at", "created_at", "updated_at") VALUES ('19cfd6fd-746d-43eb-81e1-963334d18d09', 'aa76d3cd-4273-4443-83c8-70931173e770', '799311f2-18b2-49f6-9268-b192350d1291', NULL, NULL, 'Rewiew de todos los modulos', 'revisa modulo x modulo,  ve uno por uno siguiendo los siguientes pasos&#x20;
revisa que ande todo correctamente,&#x20;
busca bugs, solucionalos
testea con casos de pruea reales todos los distintos casos de uso (utiliza el usuario [paco.semino@gmail.com](mailto:paco.semino@gmail.com) Macluctoc&510&)&#x20;
soluiciona lo fallado&#x20;
pasa al siguiente modulo
repite

No pares hatsa terminar todos los modulos, si necesitas resetear ventana encargarte de manejarlo vos creando distintas tareas  que activen al ceo varias veces me explico, es decir ersta tarea iniciales para que analises y crees multiples task asignadas al ceo las cuales ira cumpliendo el

a todo lo q impacte en la BD ponle test-{lo q testeaste}', 'done', 'high', '5bce5e22-7238-4114-8f12-35d63ec54e54', NULL, NULL, '4232cc3dfbe2c47fccfc888c9754a879', 2, 'VIN-2', 'manual', NULL, '2026-04-02T04:03:53.312+00:00', '2026-04-02T04:06:47.038+00:00', NULL, '2026-04-02T04:02:51.561663+00:00', '2026-04-02T04:06:56.853+00:00');
INSERT INTO "issues" ("id", "company_id", "project_id", "goal_id", "parent_id", "title", "description", "status", "priority", "assignee_agent_id", "assignee_user_id", "created_by_agent_id", "created_by_user_id", "issue_number", "identifier", "origin_kind", "sprint_id", "started_at", "completed_at", "cancelled_at", "created_at", "updated_at") VALUES ('db4d6e49-87e5-497a-a952-03145071dbcc', 'aa76d3cd-4273-4443-83c8-70931173e770', '799311f2-18b2-49f6-9268-b192350d1291', NULL, '19cfd6fd-746d-43eb-81e1-963334d18d09', 'Review: Auth Module', 'Revisar el módulo de autenticación end-to-end.

Pasos:
1. Probar login con paco.semino@gmail.com / Macluctoc&510&
2. Verificar JWT, refresh token, expiración
3. Probar RBAC - permisos por rol
4. Buscar bugs en backend/src/modules/auth/ y packages/auth/
5. Probar casos edge: sesión expirada, token inválido, acceso denegado
6. Revisar mfe-shell integración de auth
7. Corregir todos los bugs encontrados
8. Prefixar impactos en BD con test-auth-{descripcion}', 'done', 'high', '5bce5e22-7238-4114-8f12-35d63ec54e54', NULL, '5bce5e22-7238-4114-8f12-35d63ec54e54', NULL, 3, 'VIN-3', 'manual', NULL, '2026-04-02T04:07:58.293+00:00', '2026-04-02T04:12:22.164+00:00', NULL, '2026-04-02T04:05:31.972926+00:00', '2026-04-02T04:12:30.922+00:00');
INSERT INTO "issues" ("id", "company_id", "project_id", "goal_id", "parent_id", "title", "description", "status", "priority", "assignee_agent_id", "assignee_user_id", "created_by_agent_id", "created_by_user_id", "issue_number", "identifier", "origin_kind", "sprint_id", "started_at", "completed_at", "cancelled_at", "created_at", "updated_at") VALUES ('2b0f15b2-dab3-45b5-b4c1-94998e128114', 'aa76d3cd-4273-4443-83c8-70931173e770', '799311f2-18b2-49f6-9268-b192350d1291', NULL, '19cfd6fd-746d-43eb-81e1-963334d18d09', 'Review: Clients Module', 'Revisar módulo de clientes (mfe-clients + backend/src/modules/clients/).

Pasos:
1. Login como paco.semino@gmail.com / Macluctoc&510&
2. CRUD completo de clientes: crear, listar, editar, eliminar
3. Buscar clientes - filtros y paginación
4. Validaciones frontend y backend (Zod)
5. Custom fields de clientes si aplica
6. Verificar multi-tenancy: datos aislados por organización
7. Corregir todos los bugs encontrados
8. Prefixar impactos en BD con test-clients-{descripcion}', 'done', 'high', '5bce5e22-7238-4114-8f12-35d63ec54e54', NULL, '5bce5e22-7238-4114-8f12-35d63ec54e54', NULL, 4, 'VIN-4', 'manual', NULL, '2026-04-02T04:13:24.421+00:00', '2026-04-02T04:24:47.994+00:00', NULL, '2026-04-02T04:05:45.127295+00:00', '2026-04-02T04:25:19.931+00:00');
INSERT INTO "issues" ("id", "company_id", "project_id", "goal_id", "parent_id", "title", "description", "status", "priority", "assignee_agent_id", "assignee_user_id", "created_by_agent_id", "created_by_user_id", "issue_number", "identifier", "origin_kind", "sprint_id", "started_at", "completed_at", "cancelled_at", "created_at", "updated_at") VALUES ('5a12dcfd-3027-4329-b941-c0c6e6ab5ff7', 'aa76d3cd-4273-4443-83c8-70931173e770', '799311f2-18b2-49f6-9268-b192350d1291', NULL, '19cfd6fd-746d-43eb-81e1-963334d18d09', 'Review: Wines & Wineries Module', 'Revisar módulo de vinos y bodegas (mfe-wines + backend/src/modules/wines/ + backend/src/modules/wineries/).

Pasos:
1. CRUD completo de vinos: crear, listar, editar, eliminar, buscar
2. CRUD de bodegas
3. Asociación vino-bodega
4. Filtros: varietal, región, año, bodega, precio
5. Imágenes y metadata de vinos
6. Verificar validaciones y manejo de errores
7. Multi-tenancy: catálogo compartido vs privado
8. Corregir todos los bugs
9. Prefixar impactos en BD con test-wines-{descripcion}', 'done', 'high', '5bce5e22-7238-4114-8f12-35d63ec54e54', NULL, '5bce5e22-7238-4114-8f12-35d63ec54e54', NULL, 5, 'VIN-5', 'manual', NULL, '2026-04-02T04:26:32.646+00:00', '2026-04-02T04:39:15.834+00:00', NULL, '2026-04-02T04:05:45.147048+00:00', '2026-04-02T04:40:30.276+00:00');
INSERT INTO "issues" ("id", "company_id", "project_id", "goal_id", "parent_id", "title", "description", "status", "priority", "assignee_agent_id", "assignee_user_id", "created_by_agent_id", "created_by_user_id", "issue_number", "identifier", "origin_kind", "sprint_id", "started_at", "completed_at", "cancelled_at", "created_at", "updated_at") VALUES ('e2c6e5d8-2416-4c52-9d13-2898fdd37516', 'aa76d3cd-4273-4443-83c8-70931173e770', '799311f2-18b2-49f6-9268-b192350d1291', NULL, '19cfd6fd-746d-43eb-81e1-963334d18d09', 'Review: Products & Combos Module', 'Revisar módulo de productos (mfe-products + backend/src/modules/products/ + backend/src/modules/combos/).

Pasos:
1. CRUD completo de productos
2. Crear y gestionar combos/bundles
3. Asociación producto-vino
4. Precios base en productos
5. Categorías y clasificación
6. Disponibilidad y stock linking con inventario
7. Corregir todos los bugs
8. Prefixar impactos en BD con test-products-{descripcion}', 'done', 'high', 'c4f12073-b2b2-4e0d-81dd-81d7fa182480', NULL, '5bce5e22-7238-4114-8f12-35d63ec54e54', NULL, 6, 'VIN-6', 'manual', NULL, '2026-04-02T04:45:56.043+00:00', '2026-04-02T04:50:42.026+00:00', NULL, '2026-04-02T04:05:45.176147+00:00', '2026-04-02T04:50:50.951+00:00');
INSERT INTO "issues" ("id", "company_id", "project_id", "goal_id", "parent_id", "title", "description", "status", "priority", "assignee_agent_id", "assignee_user_id", "created_by_agent_id", "created_by_user_id", "issue_number", "identifier", "origin_kind", "sprint_id", "started_at", "completed_at", "cancelled_at", "created_at", "updated_at") VALUES ('6e401772-ca5d-48e1-aaa2-f99d64fe0929', 'aa76d3cd-4273-4443-83c8-70931173e770', '799311f2-18b2-49f6-9268-b192350d1291', NULL, '19cfd6fd-746d-43eb-81e1-963334d18d09', 'Review: Inventory Module', 'Revisar módulo de inventario (mfe-inventory + backend/src/modules/inventory/).

Pasos:
1. Ver stock actual por producto/vino/ubicación
2. Movimientos de inventario: entrada, salida, ajuste
3. Alertas de stock mínimo
4. Historial de movimientos
5. Reconciliación de inventario
6. Integración con órdenes y compras (stock se actualiza automáticamente)
7. Corregir todos los bugs
8. Prefixar impactos en BD con test-inventory-{descripcion}', 'done', 'high', 'c4f12073-b2b2-4e0d-81dd-81d7fa182480', NULL, '5bce5e22-7238-4114-8f12-35d63ec54e54', NULL, 7, 'VIN-7', 'manual', NULL, '2026-04-02T17:13:40.947+00:00', '2026-04-02T17:19:38.289+00:00', NULL, '2026-04-02T04:05:58.105139+00:00', '2026-04-02T17:29:25.916+00:00');
INSERT INTO "issues" ("id", "company_id", "project_id", "goal_id", "parent_id", "title", "description", "status", "priority", "assignee_agent_id", "assignee_user_id", "created_by_agent_id", "created_by_user_id", "issue_number", "identifier", "origin_kind", "sprint_id", "started_at", "completed_at", "cancelled_at", "created_at", "updated_at") VALUES ('b50301c7-23ba-4b29-8a9d-5912b8978d14', 'aa76d3cd-4273-4443-83c8-70931173e770', '799311f2-18b2-49f6-9268-b192350d1291', NULL, '19cfd6fd-746d-43eb-81e1-963334d18d09', 'Review: Orders Module', 'Revisar módulo de pedidos/órdenes (mfe-orders + backend/src/modules/orders/).

Pasos:
1. Crear una orden nueva con items
2. Flujo completo: borrador → confirmada → enviada → entregada → facturada
3. Cancelación y devolución de órdenes
4. Asignación de cliente a orden
5. Cálculo de totales, descuentos, impuestos
6. Impacto en inventario al confirmar
7. Historial y búsqueda de órdenes
8. Corregir todos los bugs
9. Prefixar impactos en BD con test-orders-{descripcion}', 'done', 'high', '5bce5e22-7238-4114-8f12-35d63ec54e54', NULL, '5bce5e22-7238-4114-8f12-35d63ec54e54', NULL, 8, 'VIN-8', 'manual', NULL, '2026-04-02T04:48:19.629+00:00', '2026-04-02T05:12:57.622+00:00', NULL, '2026-04-02T04:05:58.135779+00:00', '2026-04-02T05:18:37.187+00:00');
INSERT INTO "issues" ("id", "company_id", "project_id", "goal_id", "parent_id", "title", "description", "status", "priority", "assignee_agent_id", "assignee_user_id", "created_by_agent_id", "created_by_user_id", "issue_number", "identifier", "origin_kind", "sprint_id", "started_at", "completed_at", "cancelled_at", "created_at", "updated_at") VALUES ('60c3944e-1e9a-4e1b-b4d9-fc9ea95db4ac', 'aa76d3cd-4273-4443-83c8-70931173e770', '799311f2-18b2-49f6-9268-b192350d1291', NULL, '19cfd6fd-746d-43eb-81e1-963334d18d09', 'Review: Purchases Module', 'Revisar módulo de compras (mfe-purchases + backend/src/modules/purchases/).

Pasos:
1. Crear orden de compra a proveedor
2. Recepción parcial y total de mercadería
3. Actualización de inventario al recibir
4. Gestión de proveedores
5. Historial de compras y estado
6. Devoluciones a proveedor
7. Corregir todos los bugs
8. Prefixar impactos en BD con test-purchases-{descripcion}', 'done', 'high', 'c4f12073-b2b2-4e0d-81dd-81d7fa182480', NULL, '5bce5e22-7238-4114-8f12-35d63ec54e54', NULL, 9, 'VIN-9', 'manual', NULL, '2026-04-02T05:19:31.858+00:00', '2026-04-02T17:23:36.59+00:00', NULL, '2026-04-02T04:05:58.177151+00:00', '2026-04-02T17:48:18.675+00:00');
INSERT INTO "issues" ("id", "company_id", "project_id", "goal_id", "parent_id", "title", "description", "status", "priority", "assignee_agent_id", "assignee_user_id", "created_by_agent_id", "created_by_user_id", "issue_number", "identifier", "origin_kind", "sprint_id", "started_at", "completed_at", "cancelled_at", "created_at", "updated_at") VALUES ('ed3386ef-b558-4be6-beed-286038b33c39', 'aa76d3cd-4273-4443-83c8-70931173e770', '799311f2-18b2-49f6-9268-b192350d1291', NULL, '19cfd6fd-746d-43eb-81e1-963334d18d09', 'Review: POS / Sales Module', 'Revisar módulo de punto de venta y ventas (mfe-pos + backend/src/modules/sales/).

Pasos:
1. Iniciar una sesión de caja
2. Agregar productos al carrito
3. Distintos métodos de pago: efectivo, tarjeta, transferencia
4. Aplicar descuentos y promociones
5. Emitir recibo/factura
6. Cierre de caja y cuadre
7. Ventas rápidas vs órdenes formales
8. Integración con inventario (stock se descuenta)
9. Corregir todos los bugs
10. Prefixar impactos en BD con test-sales-{descripcion}', 'done', 'high', 'c4f12073-b2b2-4e0d-81dd-81d7fa182480', NULL, '5bce5e22-7238-4114-8f12-35d63ec54e54', NULL, 10, 'VIN-10', 'manual', NULL, '2026-04-02T07:28:20.541+00:00', '2026-04-02T17:23:36.638+00:00', NULL, '2026-04-02T04:06:12.488784+00:00', '2026-04-02T17:48:56.003+00:00');
INSERT INTO "issues" ("id", "company_id", "project_id", "goal_id", "parent_id", "title", "description", "status", "priority", "assignee_agent_id", "assignee_user_id", "created_by_agent_id", "created_by_user_id", "issue_number", "identifier", "origin_kind", "sprint_id", "started_at", "completed_at", "cancelled_at", "created_at", "updated_at") VALUES ('d56cc781-9803-4e09-9053-542794cabd30', 'aa76d3cd-4273-4443-83c8-70931173e770', '799311f2-18b2-49f6-9268-b192350d1291', NULL, '19cfd6fd-746d-43eb-81e1-963334d18d09', 'Review: Prices Module', 'Revisar módulo de precios (mfe-prices + backend/src/modules/prices/).

Pasos:
1. Crear y editar listas de precios
2. Asignar lista de precios a cliente o segmento
3. Vigencia de precios (fechas desde/hasta)
4. Precios por unidad vs por volumen (escalonados)
5. Integración con POS y órdenes
6. Historial de cambios de precio
7. Corregir todos los bugs
8. Prefixar impactos en BD con test-prices-{descripcion}', 'done', 'high', 'c4f12073-b2b2-4e0d-81dd-81d7fa182480', NULL, '5bce5e22-7238-4114-8f12-35d63ec54e54', NULL, 11, 'VIN-11', 'manual', NULL, '2026-04-02T07:28:20.577+00:00', '2026-04-02T17:23:36.677+00:00', NULL, '2026-04-02T04:06:12.512095+00:00', '2026-04-02T17:49:45.267+00:00');
INSERT INTO "issues" ("id", "company_id", "project_id", "goal_id", "parent_id", "title", "description", "status", "priority", "assignee_agent_id", "assignee_user_id", "created_by_agent_id", "created_by_user_id", "issue_number", "identifier", "origin_kind", "sprint_id", "started_at", "completed_at", "cancelled_at", "created_at", "updated_at") VALUES ('fa0d6905-2713-4837-8eba-51685f0af09e', 'aa76d3cd-4273-4443-83c8-70931173e770', '799311f2-18b2-49f6-9268-b192350d1291', NULL, '19cfd6fd-746d-43eb-81e1-963334d18d09', 'Review: Recipes & Formula Engine', 'Revisar módulo de recetas y motor de fórmulas (mfe-recipes + backend/src/modules/recipes/ + backend/src/modules/formula-engine/).

Pasos:
1. Crear receta con ingredientes y cantidades
2. Calcular costo de receta basado en precios de ingredientes
3. Motor de fórmulas: probar variables y operaciones
4. Asociar receta a producto
5. Producción basada en receta: descontar ingredientes del inventario
6. Escalar receta por cantidad
7. Corregir todos los bugs
8. Prefixar impactos en BD con test-recipes-{descripcion}', 'done', 'high', 'c4f12073-b2b2-4e0d-81dd-81d7fa182480', NULL, '5bce5e22-7238-4114-8f12-35d63ec54e54', NULL, 12, 'VIN-12', 'manual', NULL, '2026-04-02T07:28:20.612+00:00', '2026-04-02T17:23:36.716+00:00', NULL, '2026-04-02T04:06:12.550447+00:00', '2026-04-02T17:54:08.538+00:00');
INSERT INTO "issues" ("id", "company_id", "project_id", "goal_id", "parent_id", "title", "description", "status", "priority", "assignee_agent_id", "assignee_user_id", "created_by_agent_id", "created_by_user_id", "issue_number", "identifier", "origin_kind", "sprint_id", "started_at", "completed_at", "cancelled_at", "created_at", "updated_at") VALUES ('57ee0940-1976-493d-bf68-285b55132c7c', 'aa76d3cd-4273-4443-83c8-70931173e770', '799311f2-18b2-49f6-9268-b192350d1291', NULL, '19cfd6fd-746d-43eb-81e1-963334d18d09', 'Review: Reports Module', 'Revisar módulo de reportes (mfe-reports + backend/src/modules/reports/).

Pasos:
1. Reporte de ventas por período
2. Reporte de inventario actual y proyectado
3. Reporte de clientes top y métricas
4. Reporte de compras y costos
5. Exportación a CSV/Excel/PDF si aplica
6. Filtros por fecha, organización, categoría
7. Performance: reportes pesados con datos reales
8. Corregir todos los bugs
9. Prefixar impactos en BD con test-reports-{descripcion}', 'done', 'high', 'c4f12073-b2b2-4e0d-81dd-81d7fa182480', NULL, '5bce5e22-7238-4114-8f12-35d63ec54e54', NULL, 13, 'VIN-13', 'manual', NULL, '2026-04-02T07:28:20.645+00:00', '2026-04-02T17:29:00.064+00:00', NULL, '2026-04-02T04:06:28.934415+00:00', '2026-04-02T17:58:00.794+00:00');
INSERT INTO "issues" ("id", "company_id", "project_id", "goal_id", "parent_id", "title", "description", "status", "priority", "assignee_agent_id", "assignee_user_id", "created_by_agent_id", "created_by_user_id", "issue_number", "identifier", "origin_kind", "sprint_id", "started_at", "completed_at", "cancelled_at", "created_at", "updated_at") VALUES ('ea2fea7d-ce58-4f94-8e7f-4e30f71fbf73', 'aa76d3cd-4273-4443-83c8-70931173e770', '799311f2-18b2-49f6-9268-b192350d1291', NULL, '19cfd6fd-746d-43eb-81e1-963334d18d09', 'Review: Settings, Roles & Organizations', 'Revisar módulo de configuración, roles, organizaciones y custom fields (mfe-settings + backend/src/modules/settings/ + roles/ + organizations/ + custom-fields/).

Pasos:
1. Crear y editar organización/vinoteca
2. Gestión de usuarios y roles (RBAC)
3. Crear rol custom con permisos específicos
4. Configurar campos personalizados para entidades
5. Configuraciones de la app: idioma, moneda, zona horaria
6. Multi-tenancy: datos aislados entre organizaciones
7. Corregir todos los bugs
8. Prefixar impactos en BD con test-settings-{descripcion}', 'done', 'high', 'c4f12073-b2b2-4e0d-81dd-81d7fa182480', NULL, '5bce5e22-7238-4114-8f12-35d63ec54e54', NULL, 14, 'VIN-14', 'manual', NULL, '2026-04-02T07:28:20.681+00:00', '2026-04-02T17:29:09.341+00:00', NULL, '2026-04-02T04:06:28.957039+00:00', '2026-04-02T17:58:38.277+00:00');
INSERT INTO "issues" ("id", "company_id", "project_id", "goal_id", "parent_id", "title", "description", "status", "priority", "assignee_agent_id", "assignee_user_id", "created_by_agent_id", "created_by_user_id", "issue_number", "identifier", "origin_kind", "sprint_id", "started_at", "completed_at", "cancelled_at", "created_at", "updated_at") VALUES ('66e3f782-0b86-48de-afcf-733fc59b1d5d', 'aa76d3cd-4273-4443-83c8-70931173e770', '799311f2-18b2-49f6-9268-b192350d1291', NULL, '19cfd6fd-746d-43eb-81e1-963334d18d09', 'Review: Finance Module', 'Revisar módulo de finanzas (backend/src/modules/finance/).

Pasos:
1. Explorar endpoints disponibles del módulo
2. Cuentas por cobrar y por pagar
3. Conciliación de pagos
4. Integraciones con órdenes y compras
5. Reportes financieros si hay UI asociada
6. Validaciones y cálculos correctos
7. Corregir todos los bugs
8. Prefixar impactos en BD con test-finance-{descripcion}', 'done', 'high', 'c4f12073-b2b2-4e0d-81dd-81d7fa182480', NULL, '5bce5e22-7238-4114-8f12-35d63ec54e54', NULL, 15, 'VIN-15', 'manual', NULL, '2026-04-02T07:29:45.57+00:00', '2026-04-02T07:33:17.953+00:00', NULL, '2026-04-02T04:06:28.986575+00:00', '2026-04-02T07:33:26.772+00:00');
INSERT INTO "issues" ("id", "company_id", "project_id", "goal_id", "parent_id", "title", "description", "status", "priority", "assignee_agent_id", "assignee_user_id", "created_by_agent_id", "created_by_user_id", "issue_number", "identifier", "origin_kind", "sprint_id", "started_at", "completed_at", "cancelled_at", "created_at", "updated_at") VALUES ('acd237ab-a848-4561-b0d4-1d8a325b6e2e', 'aa76d3cd-4273-4443-83c8-70931173e770', '799311f2-18b2-49f6-9268-b192350d1291', NULL, '19cfd6fd-746d-43eb-81e1-963334d18d09', 'Review: Notifications & Workflows', 'Revisar módulo de notificaciones y flujos de trabajo (backend/src/modules/notifications/ + backend/src/modules/workflows/).

Pasos:
1. Explorar configuración de workflows y triggers
2. Notificaciones en-app: creación, lectura, archivado
3. Triggers automáticos: stock bajo → notificación, orden confirmada → workflow
4. Webhooks o email notifications si aplica
5. Historial y logs de notificaciones
6. Corregir todos los bugs
7. Prefixar impactos en BD con test-notifications-{descripcion}', 'done', 'high', 'c4f12073-b2b2-4e0d-81dd-81d7fa182480', NULL, '5bce5e22-7238-4114-8f12-35d63ec54e54', NULL, 16, 'VIN-16', 'manual', NULL, '2026-04-02T07:28:20.748+00:00', '2026-04-02T17:29:20.096+00:00', NULL, '2026-04-02T04:06:29.031461+00:00', '2026-04-02T17:59:18.404+00:00');
INSERT INTO "issues" ("id", "company_id", "project_id", "goal_id", "parent_id", "title", "description", "status", "priority", "assignee_agent_id", "assignee_user_id", "created_by_agent_id", "created_by_user_id", "issue_number", "identifier", "origin_kind", "sprint_id", "started_at", "completed_at", "cancelled_at", "created_at", "updated_at") VALUES ('3738de92-0fb9-4aca-8860-e258aca21179', 'aa76d3cd-4273-4443-83c8-70931173e770', '799311f2-18b2-49f6-9268-b192350d1291', NULL, NULL, 'optimizacion de tokkesn', 'quiero que optimices a todos los subagentes y a ti mismo ara no consumir un exceso de tokkens ya que tenemos el plan de 100$ de claude code y nos estamos quedando cada 2 por 3 sin tokens, debes optimizar a todo el equipo para que les de la ventana de 5h con los tokens que tenemos&#x20;', 'done', 'critical', '5bce5e22-7238-4114-8f12-35d63ec54e54', NULL, NULL, '4232cc3dfbe2c47fccfc888c9754a879', 17, 'VIN-17', 'manual', NULL, '2026-04-02T17:12:29.262+00:00', '2026-04-02T17:17:23.484+00:00', NULL, '2026-04-02T14:10:07.636315+00:00', '2026-04-02T17:17:35.167+00:00');
INSERT INTO "issues" ("id", "company_id", "project_id", "goal_id", "parent_id", "title", "description", "status", "priority", "assignee_agent_id", "assignee_user_id", "created_by_agent_id", "created_by_user_id", "issue_number", "identifier", "origin_kind", "sprint_id", "started_at", "completed_at", "cancelled_at", "created_at", "updated_at") VALUES ('e4c14616-bc32-4394-8959-db2043d3d3c1', 'aa76d3cd-4273-4443-83c8-70931173e770', NULL, NULL, NULL, 'Test badge verification task', NULL, 'todo', 'medium', NULL, '4232cc3dfbe2c47fccfc888c9754a879', NULL, '4232cc3dfbe2c47fccfc888c9754a879', 18, 'VIN-18', 'manual', NULL, NULL, NULL, NULL, '2026-04-03T19:39:54.589209+00:00', '2026-04-03T19:39:54.589209+00:00');
INSERT INTO "issues" ("id", "company_id", "project_id", "goal_id", "parent_id", "title", "description", "status", "priority", "assignee_agent_id", "assignee_user_id", "created_by_agent_id", "created_by_user_id", "issue_number", "identifier", "origin_kind", "sprint_id", "started_at", "completed_at", "cancelled_at", "created_at", "updated_at") VALUES ('706bbeec-b21d-4b31-9768-7e6c777b4692', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', '0b4583ca-b268-4d77-8a36-32f3b8de504b', NULL, NULL, 'Semanal security review', 'haz un analisis de securidad semanal, (solo lectura) y guardalo el fix de las vulnerabilidades encntradas en /Users/pacosemino/Desktop/Rosental/appminuta/Documentaciones/Implementaciones (utiliza sonnet 4.6)', 'todo', 'medium', 'e6a83e03-3b51-4e02-96a8-dd7da4cdd2ee', NULL, NULL, NULL, 15, 'PAC-15', 'routine_execution', NULL, NULL, NULL, NULL, '2026-04-06T06:00:30.341651+00:00', '2026-04-06T06:00:53.814+00:00');
INSERT INTO "issues" ("id", "company_id", "project_id", "goal_id", "parent_id", "title", "description", "status", "priority", "assignee_agent_id", "assignee_user_id", "created_by_agent_id", "created_by_user_id", "issue_number", "identifier", "origin_kind", "sprint_id", "started_at", "completed_at", "cancelled_at", "created_at", "updated_at") VALUES ('31d8463d-5e6b-49ee-9789-711a37be75f0', 'aa76d3cd-4273-4443-83c8-70931173e770', NULL, NULL, NULL, 'test', 'solo dime test funcionando xd! lol', 'done', 'medium', '5bce5e22-7238-4114-8f12-35d63ec54e54', NULL, NULL, '4232cc3dfbe2c47fccfc888c9754a879', 19, 'VIN-19', 'manual', NULL, '2026-04-07T13:34:51.776+00:00', '2026-04-07T13:35:00.84+00:00', NULL, '2026-04-06T13:49:53.748259+00:00', '2026-04-07T15:01:25.324+00:00');
INSERT INTO "issues" ("id", "company_id", "project_id", "goal_id", "parent_id", "title", "description", "status", "priority", "assignee_agent_id", "assignee_user_id", "created_by_agent_id", "created_by_user_id", "issue_number", "identifier", "origin_kind", "sprint_id", "started_at", "completed_at", "cancelled_at", "created_at", "updated_at") VALUES ('b1bb06ef-2304-4c80-a15c-a31c15b9eb81', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', NULL, 'ddcd9ac6-a278-4fe1-b8d8-53bd320f23b8', NULL, '5 agents stuck in error state — needs board review', '## Summary

5 agents have been in error status with no error message since ~15:30 UTC today (2026-04-06). All instruction files exist. 13+ consecutive heartbeats confirm persistent state.

## Affected Agents
- Code Reviewer (claude_local)
- Git & CI/CD Engineer (claude_local)
- Diagram Architect (claude_local)
- Documentation Engineer (claude_local)
- Security Engineer (claude_local)

## Ask

Board: please restart these agents or assign this to me to investigate further.', 'todo', 'high', NULL, NULL, NULL, '4232cc3dfbe2c47fccfc888c9754a879', 21, 'PAC-21', 'manual', NULL, NULL, NULL, NULL, '2026-04-06T17:40:06.803249+00:00', '2026-04-06T17:51:41.177+00:00');
INSERT INTO "issues" ("id", "company_id", "project_id", "goal_id", "parent_id", "title", "description", "status", "priority", "assignee_agent_id", "assignee_user_id", "created_by_agent_id", "created_by_user_id", "issue_number", "identifier", "origin_kind", "sprint_id", "started_at", "completed_at", "cancelled_at", "created_at", "updated_at") VALUES ('2b0f2f94-3659-44d5-9738-3f03134b1d4c', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', '0b4583ca-b268-4d77-8a36-32f3b8de504b', NULL, NULL, 'fix: horizontal scrollbar on bottom table', 'En el mapa de venta de un proyecto, no me deja scrollear horizontalmente ya que no hay scroll bar.  debemos de realizar que el scrollbar de los mapas de venta de los proyectos este visible', 'in_review', 'high', NULL, '4232cc3dfbe2c47fccfc888c9754a879', NULL, '4232cc3dfbe2c47fccfc888c9754a879', 23, 'PAC-23', 'manual', NULL, NULL, NULL, NULL, '2026-04-07T21:07:15.858183+00:00', '2026-04-08T13:56:17.992+00:00');
INSERT INTO "issues" ("id", "company_id", "project_id", "goal_id", "parent_id", "title", "description", "status", "priority", "assignee_agent_id", "assignee_user_id", "created_by_agent_id", "created_by_user_id", "issue_number", "identifier", "origin_kind", "sprint_id", "started_at", "completed_at", "cancelled_at", "created_at", "updated_at") VALUES ('970acb7b-a39d-4ed1-bfbc-2b3f2786c231', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', '0b4583ca-b268-4d77-8a36-32f3b8de504b', NULL, NULL, 'feat: columna movibles', 'dentro de mapa de venta de proyecto, todas las columnas deberian de ser moviles exceptuando la columna de acciones', 'done', 'low', '87473cb4-1b22-41ac-9237-92756ce89cb3', NULL, NULL, '4232cc3dfbe2c47fccfc888c9754a879', 24, 'PAC-24', 'manual', NULL, NULL, '2026-04-07T22:09:38.286+00:00', NULL, '2026-04-07T21:09:17.013752+00:00', '2026-04-07T22:10:03.597+00:00');
INSERT INTO "issues" ("id", "company_id", "project_id", "goal_id", "parent_id", "title", "description", "status", "priority", "assignee_agent_id", "assignee_user_id", "created_by_agent_id", "created_by_user_id", "issue_number", "identifier", "origin_kind", "sprint_id", "started_at", "completed_at", "cancelled_at", "created_at", "updated_at") VALUES ('4006602d-bb58-4234-b849-53068f93d29e', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', '0b4583ca-b268-4d77-8a36-32f3b8de504b', NULL, NULL, 'fix: lotes deben ordenarse primero por manzana y luego por unidad', 'Los proyectos con tipologia de lotes como pro ejemplo Vida Lagoon deberian de ordenarse default x manzana y luego x unidad, no x etapa y unidad.&#x20;', 'done', 'medium', NULL, '4232cc3dfbe2c47fccfc888c9754a879', NULL, '4232cc3dfbe2c47fccfc888c9754a879', 25, 'PAC-25', 'manual', NULL, NULL, '2026-04-09T14:03:06.927+00:00', NULL, '2026-04-07T21:10:33.911684+00:00', '2026-04-09T14:03:06.689+00:00');
INSERT INTO "issues" ("id", "company_id", "project_id", "goal_id", "parent_id", "title", "description", "status", "priority", "assignee_agent_id", "assignee_user_id", "created_by_agent_id", "created_by_user_id", "issue_number", "identifier", "origin_kind", "sprint_id", "started_at", "completed_at", "cancelled_at", "created_at", "updated_at") VALUES ('9bf24ba9-bed8-4c34-95e7-adf069a6fb92', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', '0b4583ca-b268-4d77-8a36-32f3b8de504b', NULL, NULL, 'fix: campo lote comercial; unidad funcional', '&#x20;campo lote comercial debe ser entero e ir primero; agregar unidad funcional a todos los registros de vida', 'todo', 'high', NULL, '4232cc3dfbe2c47fccfc888c9754a879', NULL, '4232cc3dfbe2c47fccfc888c9754a879', 26, 'PAC-26', 'manual', NULL, NULL, NULL, NULL, '2026-04-07T21:11:44.102795+00:00', '2026-04-07T21:11:44.102795+00:00');
INSERT INTO "issues" ("id", "company_id", "project_id", "goal_id", "parent_id", "title", "description", "status", "priority", "assignee_agent_id", "assignee_user_id", "created_by_agent_id", "created_by_user_id", "issue_number", "identifier", "origin_kind", "sprint_id", "started_at", "completed_at", "cancelled_at", "created_at", "updated_at") VALUES ('628789d0-afb4-4c37-866c-bcd7308eaae8', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', '0b4583ca-b268-4d77-8a36-32f3b8de504b', NULL, NULL, 'fix: exportar Excel', 'deberia de no ser posible seleccionar el sectorid, si deberia de ser posible incluir atributo unidad', 'in_progress', 'medium', NULL, '4232cc3dfbe2c47fccfc888c9754a879', NULL, '4232cc3dfbe2c47fccfc888c9754a879', 27, 'PAC-27', 'manual', NULL, '2026-04-08T16:31:29.598+00:00', NULL, NULL, '2026-04-07T21:12:51.677339+00:00', '2026-04-08T16:31:27+00:00');
INSERT INTO "issues" ("id", "company_id", "project_id", "goal_id", "parent_id", "title", "description", "status", "priority", "assignee_agent_id", "assignee_user_id", "created_by_agent_id", "created_by_user_id", "issue_number", "identifier", "origin_kind", "sprint_id", "started_at", "completed_at", "cancelled_at", "created_at", "updated_at") VALUES ('19be0672-74a2-46a2-8249-6ce4ba59478f', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', '0b4583ca-b268-4d77-8a36-32f3b8de504b', NULL, NULL, 'feat: notificar a firmante/admin al cambiar estado de unidad con selección de motivo obligatoria', 'Cuando hay cambio de estado en unidad (vendido, q le llegue al user rol (administrador del proyecto de la unidad en la app MV) una notificación vía app con el motivo, que la persona q lo cambia deba de seleccionar el motivo y la notificación, unidad rescindida: {{motivo}})', 'in_review', 'high', NULL, '4232cc3dfbe2c47fccfc888c9754a879', NULL, '4232cc3dfbe2c47fccfc888c9754a879', 28, 'PAC-28', 'manual', NULL, '2026-04-08T14:13:48.149+00:00', NULL, NULL, '2026-04-07T21:15:00.836684+00:00', '2026-04-08T14:48:20.848+00:00');
INSERT INTO "issues" ("id", "company_id", "project_id", "goal_id", "parent_id", "title", "description", "status", "priority", "assignee_agent_id", "assignee_user_id", "created_by_agent_id", "created_by_user_id", "issue_number", "identifier", "origin_kind", "sprint_id", "started_at", "completed_at", "cancelled_at", "created_at", "updated_at") VALUES ('4633c560-25cb-4436-8477-3a596f85b3a1', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', '0b4583ca-b268-4d77-8a36-32f3b8de504b', NULL, NULL, 'feat: subir planos desde el mapa de ventas en la app', 'deberia de ser posible que los usuarios desde el mapa de venta del proyecto pueda subir los planos directamente, deberíamos de crear la funcion para subir plano y llamarla desde el frontend, por ende hay que ctualizar tanto front (microfrontend de mapa de venta) como backend (modulo de mapa de venta)&#x20;', 'backlog', 'low', NULL, '4232cc3dfbe2c47fccfc888c9754a879', NULL, '4232cc3dfbe2c47fccfc888c9754a879', 29, 'PAC-29', 'manual', NULL, NULL, NULL, NULL, '2026-04-07T21:16:22.147816+00:00', '2026-04-08T14:16:32.357+00:00');
INSERT INTO "issues" ("id", "company_id", "project_id", "goal_id", "parent_id", "title", "description", "status", "priority", "assignee_agent_id", "assignee_user_id", "created_by_agent_id", "created_by_user_id", "issue_number", "identifier", "origin_kind", "sprint_id", "started_at", "completed_at", "cancelled_at", "created_at", "updated_at") VALUES ('5160bd4f-4d50-4805-a8eb-aed32533eaf1', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', '0b4583ca-b268-4d77-8a36-32f3b8de504b', NULL, NULL, 'fix(migracion): Fla V tiologia (D, S)', 'clasificar todas como cocheras cubiertas y agregar en observaciones (simple y doble)', 'done', 'low', NULL, '4232cc3dfbe2c47fccfc888c9754a879', NULL, '4232cc3dfbe2c47fccfc888c9754a879', 30, 'PAC-30', 'manual', NULL, NULL, '2026-04-08T16:00:07.451+00:00', NULL, '2026-04-07T21:17:34.805811+00:00', '2026-04-08T16:00:04.252+00:00');
INSERT INTO "issues" ("id", "company_id", "project_id", "goal_id", "parent_id", "title", "description", "status", "priority", "assignee_agent_id", "assignee_user_id", "created_by_agent_id", "created_by_user_id", "issue_number", "identifier", "origin_kind", "sprint_id", "started_at", "completed_at", "cancelled_at", "created_at", "updated_at") VALUES ('a61a4f3d-cd00-4c3d-9289-ce6d75408758', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', '0b4583ca-b268-4d77-8a36-32f3b8de504b', NULL, NULL, 'feat: subir proyectos Nativo (Rosental y Rossetti)', 'subir proyectos Nativo (Rosental y Rossetti) compartido por mica a valen', 'todo', 'low', NULL, '4232cc3dfbe2c47fccfc888c9754a879', NULL, '4232cc3dfbe2c47fccfc888c9754a879', 31, 'PAC-31', 'manual', NULL, NULL, NULL, NULL, '2026-04-07T21:18:10.372647+00:00', '2026-04-07T21:18:10.372647+00:00');
INSERT INTO "issues" ("id", "company_id", "project_id", "goal_id", "parent_id", "title", "description", "status", "priority", "assignee_agent_id", "assignee_user_id", "created_by_agent_id", "created_by_user_id", "issue_number", "identifier", "origin_kind", "sprint_id", "started_at", "completed_at", "cancelled_at", "created_at", "updated_at") VALUES ('8902fe39-f398-47ad-9520-8d955b923569', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', '0b4583ca-b268-4d77-8a36-32f3b8de504b', NULL, NULL, 'fix: rol firmante — puede ver todas las minutas pero solo firmar las aprobadas', 'el rol de firmante dentro de minutas, deberia de poder ver todas las minutas pero solo firmar las aprobadas (manteniendo la regla de minutas provenientes de su proyecto)&#x20;', 'done', 'critical', NULL, '4232cc3dfbe2c47fccfc888c9754a879', NULL, '4232cc3dfbe2c47fccfc888c9754a879', 32, 'PAC-32', 'manual', NULL, '2026-04-08T14:48:28.582+00:00', '2026-04-08T16:12:28.67+00:00', NULL, '2026-04-07T21:19:19.072019+00:00', '2026-04-08T16:12:26.313+00:00');
INSERT INTO "issues" ("id", "company_id", "project_id", "goal_id", "parent_id", "title", "description", "status", "priority", "assignee_agent_id", "assignee_user_id", "created_by_agent_id", "created_by_user_id", "issue_number", "identifier", "origin_kind", "sprint_id", "started_at", "completed_at", "cancelled_at", "created_at", "updated_at") VALUES ('d9523100-3aff-4c0e-bd26-90d23f4d7417', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', '0b4583ca-b268-4d77-8a36-32f3b8de504b', NULL, NULL, 'feat: selector de precio al crear minuta (existen múltiples campos de precio)', 'disenar una solución para casos en los cuales se desea realizar una minuta sobre un precio de una columna distinta a la columna de precio de lista (hablamos de columnas que capaz viven en la columna datos adicionales de la unidad)', 'backlog', 'low', NULL, '4232cc3dfbe2c47fccfc888c9754a879', NULL, '4232cc3dfbe2c47fccfc888c9754a879', 33, 'PAC-33', 'manual', NULL, NULL, NULL, NULL, '2026-04-07T21:20:36.021572+00:00', '2026-04-07T21:20:36.021572+00:00');
INSERT INTO "issues" ("id", "company_id", "project_id", "goal_id", "parent_id", "title", "description", "status", "priority", "assignee_agent_id", "assignee_user_id", "created_by_agent_id", "created_by_user_id", "issue_number", "identifier", "origin_kind", "sprint_id", "started_at", "completed_at", "cancelled_at", "created_at", "updated_at") VALUES ('24d86ca5-f296-4462-b188-8b29289e0f5e', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', '0b4583ca-b268-4d77-8a36-32f3b8de504b', NULL, NULL, 'fix: regla de negocio — bloquear precio negociado mayor al precio de lista al crear minuta', 'quitar regla de negocio que evita que no se pueda crear una minuta con precio negociado mayor que precio de lista.&#x20;

Razón: no tiene sentido dicho chekeo ya que luego hay doble chekeo x parte tanto del rol administrador (quien apruba la minuta) y rol firmante (quien firma minuta previamnte aprobada)&#x20;', 'done', 'medium', NULL, '4232cc3dfbe2c47fccfc888c9754a879', NULL, '4232cc3dfbe2c47fccfc888c9754a879', 34, 'PAC-34', 'manual', NULL, '2026-04-08T14:48:22.015+00:00', '2026-04-08T15:26:13.82+00:00', NULL, '2026-04-07T21:22:11.810046+00:00', '2026-04-08T15:26:11.596+00:00');
INSERT INTO "issues" ("id", "company_id", "project_id", "goal_id", "parent_id", "title", "description", "status", "priority", "assignee_agent_id", "assignee_user_id", "created_by_agent_id", "created_by_user_id", "issue_number", "identifier", "origin_kind", "sprint_id", "started_at", "completed_at", "cancelled_at", "created_at", "updated_at") VALUES ('4cee16e6-c661-4fee-b19f-659ffc602ca3', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', '0b4583ca-b268-4d77-8a36-32f3b8de504b', NULL, NULL, 'Check: path proyecto local correcto', 'simplemente dime si encuentras el archivo del proyecto appminutas en la computadora (si elpath que te setee esta correcto)&#x20;', 'done', 'low', 'd48d6423-4826-4770-8844-66409d2c49ee', NULL, NULL, '4232cc3dfbe2c47fccfc888c9754a879', 35, 'PAC-35', 'manual', NULL, '2026-04-07T21:32:10.719+00:00', '2026-04-07T21:32:47.184+00:00', NULL, '2026-04-07T21:28:59.065515+00:00', '2026-04-07T21:33:16.458+00:00');
INSERT INTO "issues" ("id", "company_id", "project_id", "goal_id", "parent_id", "title", "description", "status", "priority", "assignee_agent_id", "assignee_user_id", "created_by_agent_id", "created_by_user_id", "issue_number", "identifier", "origin_kind", "sprint_id", "started_at", "completed_at", "cancelled_at", "created_at", "updated_at") VALUES ('2a4f3991-b038-4346-a106-d1665846ccc9', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', '0b4583ca-b268-4d77-8a36-32f3b8de504b', NULL, NULL, 'feature: agregar seeders al proyecto', NULL, 'done', 'medium', NULL, '4232cc3dfbe2c47fccfc888c9754a879', NULL, '4232cc3dfbe2c47fccfc888c9754a879', 36, 'PAC-36', 'manual', NULL, '2026-04-08T14:55:26.806+00:00', '2026-04-09T12:16:53.153+00:00', NULL, '2026-04-08T14:55:25.544917+00:00', '2026-04-09T12:16:52.59+00:00');
INSERT INTO "issues" ("id", "company_id", "project_id", "goal_id", "parent_id", "title", "description", "status", "priority", "assignee_agent_id", "assignee_user_id", "created_by_agent_id", "created_by_user_id", "issue_number", "identifier", "origin_kind", "sprint_id", "started_at", "completed_at", "cancelled_at", "created_at", "updated_at") VALUES ('07c2363b-93b2-413c-9ac5-5895f4c4b60c', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', '0b4583ca-b268-4d77-8a36-32f3b8de504b', NULL, NULL, 'Asegurar orden correcto en la numeración de lotes', 'Verificar y garantizar que la numeración de los lotes se presente de manera secuencial y correcta, resolviendo cualquier discrepancia o inconsistencia en el orden actual.', 'backlog', 'high', NULL, NULL, NULL, 'rdMTa7gH3Y92loVIxgW5qvUEqcZH69tJ', 38, 'PAC-38', 'manual', NULL, NULL, NULL, NULL, '2026-04-08T15:33:26.085806+00:00', '2026-04-08T15:33:26.085806+00:00');
INSERT INTO "issues" ("id", "company_id", "project_id", "goal_id", "parent_id", "title", "description", "status", "priority", "assignee_agent_id", "assignee_user_id", "created_by_agent_id", "created_by_user_id", "issue_number", "identifier", "origin_kind", "sprint_id", "started_at", "completed_at", "cancelled_at", "created_at", "updated_at") VALUES ('4b80d393-3471-4b6b-94d8-bed0c3ae8e71', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', '0b4583ca-b268-4d77-8a36-32f3b8de504b', NULL, NULL, 'Mover ''ESTADO'' y ''PLANO'' al inicio de la visualización', 'Reorganizar la interfaz de usuario para que los campos ''ESTADO'' y ''PLANO'' aparezcan al principio de la lista o tabla, mejorando la visibilidad de esta información clave.', 'backlog', 'medium', NULL, NULL, NULL, 'rdMTa7gH3Y92loVIxgW5qvUEqcZH69tJ', 39, 'PAC-39', 'manual', NULL, NULL, NULL, NULL, '2026-04-08T15:33:32.199827+00:00', '2026-04-08T15:33:32.199827+00:00');
INSERT INTO "issues" ("id", "company_id", "project_id", "goal_id", "parent_id", "title", "description", "status", "priority", "assignee_agent_id", "assignee_user_id", "created_by_agent_id", "created_by_user_id", "issue_number", "identifier", "origin_kind", "sprint_id", "started_at", "completed_at", "cancelled_at", "created_at", "updated_at") VALUES ('bf41cdfe-14fd-4596-a174-d20924090f47', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', '0b4583ca-b268-4d77-8a36-32f3b8de504b', NULL, NULL, 'Separar descripción y número de lote en exportación', 'Modificar la lógica de exportación de datos para que la descripción del lote (ej. MANZANA) y el número de lote se presenten en columnas separadas, permitiendo un filtrado más eficiente.', 'backlog', 'high', NULL, NULL, NULL, 'rdMTa7gH3Y92loVIxgW5qvUEqcZH69tJ', 40, 'PAC-40', 'manual', NULL, NULL, NULL, NULL, '2026-04-08T15:33:38.680555+00:00', '2026-04-08T15:33:38.680555+00:00');
INSERT INTO "issues" ("id", "company_id", "project_id", "goal_id", "parent_id", "title", "description", "status", "priority", "assignee_agent_id", "assignee_user_id", "created_by_agent_id", "created_by_user_id", "issue_number", "identifier", "origin_kind", "sprint_id", "started_at", "completed_at", "cancelled_at", "created_at", "updated_at") VALUES ('4762dd60-347c-40df-aaeb-deb0c05fd9e7', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', '0b4583ca-b268-4d77-8a36-32f3b8de504b', NULL, NULL, 'Implementar visualización de cambios en precio de lista y estado', 'Desarrollar mecanismos para mostrar de forma clara y destacada cualquier modificación realizada en el ''precio de lista'' y en el ''estado'' de los lotes.', 'backlog', 'medium', NULL, NULL, NULL, 'rdMTa7gH3Y92loVIxgW5qvUEqcZH69tJ', 41, 'PAC-41', 'manual', NULL, NULL, NULL, NULL, '2026-04-08T15:33:44.802939+00:00', '2026-04-09T12:24:19.072+00:00');
INSERT INTO "issues" ("id", "company_id", "project_id", "goal_id", "parent_id", "title", "description", "status", "priority", "assignee_agent_id", "assignee_user_id", "created_by_agent_id", "created_by_user_id", "issue_number", "identifier", "origin_kind", "sprint_id", "started_at", "completed_at", "cancelled_at", "created_at", "updated_at") VALUES ('f4fb1da3-27e1-4c5d-b664-856ea45ed821', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', NULL, 'ddcd9ac6-a278-4fe1-b8d8-53bd320f23b8', '8902fe39-f398-47ad-9520-8d955b923569', 'complete 8 abril 2026', NULL, 'todo', 'medium', NULL, NULL, NULL, '4232cc3dfbe2c47fccfc888c9754a879', 42, 'PAC-42', 'manual', NULL, NULL, NULL, NULL, '2026-04-08T21:29:53.135831+00:00', '2026-04-08T21:29:53.135831+00:00');
INSERT INTO "issues" ("id", "company_id", "project_id", "goal_id", "parent_id", "title", "description", "status", "priority", "assignee_agent_id", "assignee_user_id", "created_by_agent_id", "created_by_user_id", "issue_number", "identifier", "origin_kind", "sprint_id", "started_at", "completed_at", "cancelled_at", "created_at", "updated_at") VALUES ('80c279ef-b15b-4dc9-9d82-5fc3c5703d56', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', '0b4583ca-b268-4d77-8a36-32f3b8de504b', NULL, NULL, 'Cambiar en unidades de tipo lote el numero de unidad', 'En el mapa tenemos que tener el numero de unidad(numero de lote), numero de lote comercial y numero de unidad funcional. En el sector ID tenemos que agarrrar el numero de lote comercial (LoteCom)', 'backlog', 'medium', NULL, NULL, NULL, 'rdMTa7gH3Y92loVIxgW5qvUEqcZH69tJ', 43, 'PAC-43', 'manual', NULL, NULL, NULL, NULL, '2026-04-09T12:41:58.793068+00:00', '2026-04-09T12:41:58.793068+00:00');

-- Instance user roles
INSERT INTO "instance_user_roles" ("id", "user_id", "role", "created_at", "updated_at") VALUES ('9fa99257-650e-4505-8a60-29e8c5f96901', '4232cc3dfbe2c47fccfc888c9754a879', 'instance_admin', '2026-04-04T23:49:50.064476+00:00', '2026-04-04T23:49:50.064476+00:00');

-- Company memberships
INSERT INTO "company_memberships" ("id", "company_id", "principal_type", "principal_id", "status", "membership_role", "created_at", "updated_at") VALUES ('d83a8827-9540-4852-b313-f71dcf4fdc98', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'user', '4232cc3dfbe2c47fccfc888c9754a879', 'active', 'owner', '2026-04-01T19:32:30.338759+00:00', '2026-04-01T19:32:30.338759+00:00');
INSERT INTO "company_memberships" ("id", "company_id", "principal_type", "principal_id", "status", "membership_role", "created_at", "updated_at") VALUES ('b3609c14-efc8-4c4c-989c-b3b120054d03', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'agent', 'd48d6423-4826-4770-8844-66409d2c49ee', 'active', 'member', '2026-04-01T19:32:55.726783+00:00', '2026-04-01T19:32:55.726783+00:00');
INSERT INTO "company_memberships" ("id", "company_id", "principal_type", "principal_id", "status", "membership_role", "created_at", "updated_at") VALUES ('4dee4512-deec-4a18-b150-befece28732d', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'agent', '17fa4545-c205-4692-b227-9b1d1aff93a6', 'active', 'member', '2026-04-01T19:33:27.419898+00:00', '2026-04-01T19:33:27.419898+00:00');
INSERT INTO "company_memberships" ("id", "company_id", "principal_type", "principal_id", "status", "membership_role", "created_at", "updated_at") VALUES ('d8167716-d38a-4020-abae-7d964fc1fad9', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'agent', '19f107ec-b43a-4ab6-ad60-b743253725c8', 'active', 'member', '2026-04-01T19:57:36.835787+00:00', '2026-04-01T19:57:36.835787+00:00');
INSERT INTO "company_memberships" ("id", "company_id", "principal_type", "principal_id", "status", "membership_role", "created_at", "updated_at") VALUES ('5a2a5c67-4b9a-4903-8e53-0f2023f78880', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'agent', '73f5ce68-0c3b-410d-8f85-0024dd46c37f', 'active', 'member', '2026-04-01T21:04:42.970096+00:00', '2026-04-01T21:04:42.970096+00:00');
INSERT INTO "company_memberships" ("id", "company_id", "principal_type", "principal_id", "status", "membership_role", "created_at", "updated_at") VALUES ('11ade1a7-0a1f-45df-a6d5-a251933e2418', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'agent', '16a977ab-7557-4e0e-bd81-8791ba1eff1f', 'active', 'member', '2026-04-01T21:06:02.694897+00:00', '2026-04-01T21:06:02.694897+00:00');
INSERT INTO "company_memberships" ("id", "company_id", "principal_type", "principal_id", "status", "membership_role", "created_at", "updated_at") VALUES ('759d846c-b3b1-4fa5-a9e3-ec5c5bad039f', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'agent', '7ce4702a-373d-46d2-b2d7-b95f15d59ba9', 'active', 'member', '2026-04-01T21:06:15.01006+00:00', '2026-04-01T21:06:15.01006+00:00');
INSERT INTO "company_memberships" ("id", "company_id", "principal_type", "principal_id", "status", "membership_role", "created_at", "updated_at") VALUES ('c60a7542-9960-4da9-83f4-9a9506edc301', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'agent', '4fb22a8f-dcef-4664-939d-4add7e139a3a', 'active', 'member', '2026-04-01T21:06:19.05471+00:00', '2026-04-01T21:06:19.05471+00:00');
INSERT INTO "company_memberships" ("id", "company_id", "principal_type", "principal_id", "status", "membership_role", "created_at", "updated_at") VALUES ('25759a64-a55e-4eef-8521-ec4031048a2e', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'agent', '87473cb4-1b22-41ac-9237-92756ce89cb3', 'active', 'member', '2026-04-01T21:16:40.279232+00:00', '2026-04-01T21:16:40.279232+00:00');
INSERT INTO "company_memberships" ("id", "company_id", "principal_type", "principal_id", "status", "membership_role", "created_at", "updated_at") VALUES ('b52735cb-5812-4aa1-9e4a-95027d72d0d3', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'agent', 'a26366e5-a1ee-4d0a-a5d0-4f129f7705f7', 'active', 'member', '2026-04-01T21:25:06.966107+00:00', '2026-04-01T21:25:06.966107+00:00');
INSERT INTO "company_memberships" ("id", "company_id", "principal_type", "principal_id", "status", "membership_role", "created_at", "updated_at") VALUES ('9b0bf79b-f04c-465e-a16c-2eb86c5668e5', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'agent', '72ea4532-09e6-4fe8-90f1-c9569a2ad1e7', 'active', 'member', '2026-04-01T21:25:10.994054+00:00', '2026-04-01T21:25:10.994054+00:00');
INSERT INTO "company_memberships" ("id", "company_id", "principal_type", "principal_id", "status", "membership_role", "created_at", "updated_at") VALUES ('61386ffa-8d9c-4136-a8da-44d02f158454', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'agent', 'dd9adbad-d4df-4cef-b6a1-cd1412161421', 'active', 'member', '2026-04-01T21:25:14.667152+00:00', '2026-04-01T21:25:14.667152+00:00');
INSERT INTO "company_memberships" ("id", "company_id", "principal_type", "principal_id", "status", "membership_role", "created_at", "updated_at") VALUES ('6e51cbe3-f2a2-4ac9-bac9-47cab7ce4866', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'agent', 'b68e9121-2237-4524-999b-4c13955830cb', 'active', 'member', '2026-04-01T21:25:16.799225+00:00', '2026-04-01T21:25:16.799225+00:00');
INSERT INTO "company_memberships" ("id", "company_id", "principal_type", "principal_id", "status", "membership_role", "created_at", "updated_at") VALUES ('e08dca34-7d4d-400e-b86b-e467e051335c', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'agent', '1d19c36a-1289-402f-b387-c6054c2d2a0d', 'active', 'member', '2026-04-01T21:25:22.27653+00:00', '2026-04-01T21:25:22.27653+00:00');
INSERT INTO "company_memberships" ("id", "company_id", "principal_type", "principal_id", "status", "membership_role", "created_at", "updated_at") VALUES ('f4461de5-9fe8-49c7-9cea-2376501590c8', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'agent', '174b498e-ae15-4009-90a7-c9eee24c6181', 'active', 'member', '2026-04-01T21:25:48.358284+00:00', '2026-04-01T21:25:48.358284+00:00');
INSERT INTO "company_memberships" ("id", "company_id", "principal_type", "principal_id", "status", "membership_role", "created_at", "updated_at") VALUES ('19bdf7b8-9452-40ab-9f0f-7910dc1c1ad5', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'agent', '232c3049-1208-4bc2-b193-86e475dc3908', 'active', 'member', '2026-04-01T21:26:19.692085+00:00', '2026-04-01T21:26:19.692085+00:00');
INSERT INTO "company_memberships" ("id", "company_id", "principal_type", "principal_id", "status", "membership_role", "created_at", "updated_at") VALUES ('bb0b554e-65ed-4b1b-99a1-1d777a5ab1f3', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'agent', 'e6a83e03-3b51-4e02-96a8-dd7da4cdd2ee', 'active', 'member', '2026-04-01T21:26:23.016048+00:00', '2026-04-01T21:26:23.016048+00:00');
INSERT INTO "company_memberships" ("id", "company_id", "principal_type", "principal_id", "status", "membership_role", "created_at", "updated_at") VALUES ('bc4982b8-25e2-483b-8d4b-08bd121f56e1', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'agent', 'e3e62f3c-6de9-4528-9ab0-ffad0d6c1676', 'active', 'member', '2026-04-01T21:26:25.649388+00:00', '2026-04-01T21:26:25.649388+00:00');
INSERT INTO "company_memberships" ("id", "company_id", "principal_type", "principal_id", "status", "membership_role", "created_at", "updated_at") VALUES ('e19429c2-d6a1-403e-84f9-d84d63b0feda', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'agent', '32403353-6ad3-4521-a9c7-a5c8f51ff9a8', 'active', 'member', '2026-04-01T21:26:28.168483+00:00', '2026-04-01T21:26:28.168483+00:00');
INSERT INTO "company_memberships" ("id", "company_id", "principal_type", "principal_id", "status", "membership_role", "created_at", "updated_at") VALUES ('a540b552-8ecb-4630-93ce-38bd3788cc6e', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'agent', 'd0c84936-dd12-4c48-9701-5de5c3ec6eef', 'active', 'member', '2026-04-01T21:47:42.033941+00:00', '2026-04-01T21:47:42.033941+00:00');
INSERT INTO "company_memberships" ("id", "company_id", "principal_type", "principal_id", "status", "membership_role", "created_at", "updated_at") VALUES ('4cc7c6c2-85be-47d8-85bb-43727382c350', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'agent', 'e4b9c3e5-cbe7-496f-9339-a4cf4d00721f', 'active', 'member', '2026-04-01T21:47:45.95789+00:00', '2026-04-01T21:47:45.95789+00:00');
INSERT INTO "company_memberships" ("id", "company_id", "principal_type", "principal_id", "status", "membership_role", "created_at", "updated_at") VALUES ('d8d6f1b8-ac70-4b6e-bdbe-d44894ab36fd', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'agent', '868cf94b-ed2f-4a1e-83c2-a52ce4bb45c5', 'active', 'member', '2026-04-01T21:47:49.843961+00:00', '2026-04-01T21:47:49.843961+00:00');
INSERT INTO "company_memberships" ("id", "company_id", "principal_type", "principal_id", "status", "membership_role", "created_at", "updated_at") VALUES ('19b395d7-212f-42bb-b43f-6efac60a7a76', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'agent', '05069531-0435-42da-9d23-5e4c1529fb9f', 'active', 'member', '2026-04-01T22:08:42.102703+00:00', '2026-04-01T22:08:42.102703+00:00');
INSERT INTO "company_memberships" ("id", "company_id", "principal_type", "principal_id", "status", "membership_role", "created_at", "updated_at") VALUES ('42bd173a-e2bb-47fb-9b11-7f5f83c46c64', '85b9dfd2-6c89-4676-8358-3cb2b6495f86', 'user', '4232cc3dfbe2c47fccfc888c9754a879', 'active', 'owner', '2026-04-01T22:11:26.330483+00:00', '2026-04-01T22:11:26.330483+00:00');
INSERT INTO "company_memberships" ("id", "company_id", "principal_type", "principal_id", "status", "membership_role", "created_at", "updated_at") VALUES ('4bc2f0fe-5df1-475c-913e-b57f31a1016f', '85b9dfd2-6c89-4676-8358-3cb2b6495f86', 'agent', '017b9931-b2a8-47ce-a5dc-b5b703db9f94', 'active', 'member', '2026-04-01T22:11:46.053424+00:00', '2026-04-01T22:11:46.053424+00:00');
INSERT INTO "company_memberships" ("id", "company_id", "principal_type", "principal_id", "status", "membership_role", "created_at", "updated_at") VALUES ('01af9576-b11b-438d-acb1-e5dfc7156605', '85b9dfd2-6c89-4676-8358-3cb2b6495f86', 'agent', '326a9040-177a-4ebe-9a2f-19c52d61b16b', 'active', 'member', '2026-04-01T22:16:23.375957+00:00', '2026-04-01T22:16:23.375957+00:00');
INSERT INTO "company_memberships" ("id", "company_id", "principal_type", "principal_id", "status", "membership_role", "created_at", "updated_at") VALUES ('2c193f77-9851-48fb-bf21-48b4fcf95c57', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'agent', '27fa3ed9-3dea-4dfa-8ab1-d934348b75c4', 'active', 'member', '2026-04-01T22:20:27.69577+00:00', '2026-04-01T22:20:27.69577+00:00');
INSERT INTO "company_memberships" ("id", "company_id", "principal_type", "principal_id", "status", "membership_role", "created_at", "updated_at") VALUES ('20d674d9-386d-4789-a04c-a38772f22c37', '85b9dfd2-6c89-4676-8358-3cb2b6495f86', 'agent', '986728e6-a51c-4002-b11b-a117df32a5ae', 'active', 'member', '2026-04-01T22:35:16.187262+00:00', '2026-04-01T22:35:16.187262+00:00');
INSERT INTO "company_memberships" ("id", "company_id", "principal_type", "principal_id", "status", "membership_role", "created_at", "updated_at") VALUES ('dd15db3e-6608-4b0e-bc0d-4343559d37b0', '85b9dfd2-6c89-4676-8358-3cb2b6495f86', 'agent', '7e837cf1-88f6-47dd-8864-a50f24d20f87', 'active', 'member', '2026-04-01T22:35:20.702424+00:00', '2026-04-01T22:35:20.702424+00:00');
INSERT INTO "company_memberships" ("id", "company_id", "principal_type", "principal_id", "status", "membership_role", "created_at", "updated_at") VALUES ('1678a240-64dc-425d-bb80-99b6f0935e9b', '85b9dfd2-6c89-4676-8358-3cb2b6495f86', 'agent', '7bbb4820-00b5-43d5-8bf3-61827e40205b', 'active', 'member', '2026-04-01T22:35:25.592524+00:00', '2026-04-01T22:35:25.592524+00:00');
INSERT INTO "company_memberships" ("id", "company_id", "principal_type", "principal_id", "status", "membership_role", "created_at", "updated_at") VALUES ('bd7b4a78-a3f2-44a5-bdb8-042373db07fa', 'aa76d3cd-4273-4443-83c8-70931173e770', 'user', '4232cc3dfbe2c47fccfc888c9754a879', 'active', 'owner', '2026-04-02T03:16:27.46606+00:00', '2026-04-02T03:16:27.46606+00:00');
INSERT INTO "company_memberships" ("id", "company_id", "principal_type", "principal_id", "status", "membership_role", "created_at", "updated_at") VALUES ('3255b013-0de3-489e-af55-e1cb59c6c585', 'aa76d3cd-4273-4443-83c8-70931173e770', 'agent', '5bce5e22-7238-4114-8f12-35d63ec54e54', 'active', 'member', '2026-04-02T03:16:39.159277+00:00', '2026-04-02T03:16:39.159277+00:00');
INSERT INTO "company_memberships" ("id", "company_id", "principal_type", "principal_id", "status", "membership_role", "created_at", "updated_at") VALUES ('5c4ff276-389a-4a0b-81b0-222079f29db7', 'aa76d3cd-4273-4443-83c8-70931173e770', 'agent', '45f673ac-67e0-4d39-b461-91d4f62a7e90', 'active', 'member', '2026-04-02T03:20:08.215911+00:00', '2026-04-02T03:20:08.215911+00:00');
INSERT INTO "company_memberships" ("id", "company_id", "principal_type", "principal_id", "status", "membership_role", "created_at", "updated_at") VALUES ('1c907414-61dc-4164-8b74-f605fd48dae5', 'aa76d3cd-4273-4443-83c8-70931173e770', 'agent', 'fd0af5a8-0f87-4d04-91b1-234bfbdb0ff4', 'active', 'member', '2026-04-02T03:20:26.408649+00:00', '2026-04-02T03:20:26.408649+00:00');
INSERT INTO "company_memberships" ("id", "company_id", "principal_type", "principal_id", "status", "membership_role", "created_at", "updated_at") VALUES ('9d5a2a6b-20f0-499d-bf2a-98588fefefdb', 'aa76d3cd-4273-4443-83c8-70931173e770', 'agent', '50953961-cdd2-4e66-b5dd-271b26fb6347', 'active', 'member', '2026-04-02T03:20:32.118442+00:00', '2026-04-02T03:20:32.118442+00:00');
INSERT INTO "company_memberships" ("id", "company_id", "principal_type", "principal_id", "status", "membership_role", "created_at", "updated_at") VALUES ('6b206076-82a9-42d4-83cc-0600a67a1f49', 'aa76d3cd-4273-4443-83c8-70931173e770', 'agent', 'aabf3f57-5130-40cf-82c5-6c25c1fdaddc', 'active', 'member', '2026-04-02T03:20:36.181676+00:00', '2026-04-02T03:20:36.181676+00:00');
INSERT INTO "company_memberships" ("id", "company_id", "principal_type", "principal_id", "status", "membership_role", "created_at", "updated_at") VALUES ('08496ed5-5547-4fbc-b26e-da9f1692cc85', 'aa76d3cd-4273-4443-83c8-70931173e770', 'agent', '6b7d8720-1771-4aae-900e-6161522aab5c', 'active', 'member', '2026-04-02T03:20:40.88839+00:00', '2026-04-02T03:20:40.88839+00:00');
INSERT INTO "company_memberships" ("id", "company_id", "principal_type", "principal_id", "status", "membership_role", "created_at", "updated_at") VALUES ('f8a569d3-cc4e-422a-b124-14e038fe6d98', 'aa76d3cd-4273-4443-83c8-70931173e770', 'agent', '8eb920fe-884c-4156-b2fe-7268e2f4985f', 'active', 'member', '2026-04-02T03:20:45.438182+00:00', '2026-04-02T03:20:45.438182+00:00');
INSERT INTO "company_memberships" ("id", "company_id", "principal_type", "principal_id", "status", "membership_role", "created_at", "updated_at") VALUES ('365b1d2d-3268-4cf6-aa6a-2929e26d898e', 'aa76d3cd-4273-4443-83c8-70931173e770', 'agent', 'c2f3bcdc-196b-492e-93c2-46e7e6c3d3be', 'active', 'member', '2026-04-02T03:20:52.091586+00:00', '2026-04-02T03:20:52.091586+00:00');
INSERT INTO "company_memberships" ("id", "company_id", "principal_type", "principal_id", "status", "membership_role", "created_at", "updated_at") VALUES ('f746057b-9117-4d85-900c-bee64fefa4f9', 'aa76d3cd-4273-4443-83c8-70931173e770', 'agent', 'c4f12073-b2b2-4e0d-81dd-81d7fa182480', 'active', 'member', '2026-04-02T03:20:55.389557+00:00', '2026-04-02T03:20:55.389557+00:00');
INSERT INTO "company_memberships" ("id", "company_id", "principal_type", "principal_id", "status", "membership_role", "created_at", "updated_at") VALUES ('3e3645fd-8f7e-494a-af76-c4848fbb81e5', 'aa76d3cd-4273-4443-83c8-70931173e770', 'agent', '4c1a5377-93e5-4c99-bfe9-164217f9c592', 'active', 'member', '2026-04-02T03:21:00.150057+00:00', '2026-04-02T03:21:00.150057+00:00');
INSERT INTO "company_memberships" ("id", "company_id", "principal_type", "principal_id", "status", "membership_role", "created_at", "updated_at") VALUES ('286ffacc-9878-4814-afb7-7c488a5eddd8', 'aa76d3cd-4273-4443-83c8-70931173e770', 'agent', 'd4f5484f-6fb0-4c93-9077-68b54543f28a', 'active', 'member', '2026-04-02T03:21:05.407865+00:00', '2026-04-02T03:21:05.407865+00:00');
INSERT INTO "company_memberships" ("id", "company_id", "principal_type", "principal_id", "status", "membership_role", "created_at", "updated_at") VALUES ('c94ebb63-2be7-4be2-af12-615c53a61f69', 'aa76d3cd-4273-4443-83c8-70931173e770', 'agent', '4d8c1246-b3dd-4bef-9c5d-c7cb5560ceca', 'active', 'member', '2026-04-02T03:21:09.778968+00:00', '2026-04-02T03:21:09.778968+00:00');
INSERT INTO "company_memberships" ("id", "company_id", "principal_type", "principal_id", "status", "membership_role", "created_at", "updated_at") VALUES ('6c982673-a8b3-4255-a485-0f2c23f97e45', 'aa76d3cd-4273-4443-83c8-70931173e770', 'agent', 'a8d2aac9-6163-415b-a2f1-18b073ae8456', 'active', 'member', '2026-04-02T03:21:14.773574+00:00', '2026-04-02T03:21:14.773574+00:00');
INSERT INTO "company_memberships" ("id", "company_id", "principal_type", "principal_id", "status", "membership_role", "created_at", "updated_at") VALUES ('35b7a6ae-fa3c-47f3-91c6-7e574a6201e0', 'aa76d3cd-4273-4443-83c8-70931173e770', 'agent', '38d47c16-ec71-4f44-9e0a-84b167cf16f7', 'active', 'member', '2026-04-02T03:21:19.294929+00:00', '2026-04-02T03:21:19.294929+00:00');
INSERT INTO "company_memberships" ("id", "company_id", "principal_type", "principal_id", "status", "membership_role", "created_at", "updated_at") VALUES ('3e5a6982-30b0-4a7f-be03-5d4387ac5aff', 'aa76d3cd-4273-4443-83c8-70931173e770', 'agent', '36a8c34d-25ad-4b0c-950d-953e16c776e7', 'active', 'member', '2026-04-02T03:21:24.178668+00:00', '2026-04-02T03:21:24.178668+00:00');
INSERT INTO "company_memberships" ("id", "company_id", "principal_type", "principal_id", "status", "membership_role", "created_at", "updated_at") VALUES ('7a21d156-c7d3-48aa-a860-ab7852609cdf', 'aa76d3cd-4273-4443-83c8-70931173e770', 'user', 'tGaJ6fCJC6fOScn5yPz32qvB9QO1GBus', 'active', 'developer', '2026-04-06T20:26:10.341115+00:00', '2026-04-06T22:25:39.93+00:00');
INSERT INTO "company_memberships" ("id", "company_id", "principal_type", "principal_id", "status", "membership_role", "created_at", "updated_at") VALUES ('28b87059-761e-4d73-93c0-449a0d896c07', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'user', 'nfTjcoUrX5AX1wlujz4GUS7dpwBnyppq', 'active', 'owner', '2026-04-07T14:42:06.702055+00:00', '2026-04-09T12:33:08.115+00:00');
INSERT INTO "company_memberships" ("id", "company_id", "principal_type", "principal_id", "status", "membership_role", "created_at", "updated_at") VALUES ('313a21d4-5d71-4bd6-a3be-afe089ccb3d9', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'user', 'rdMTa7gH3Y92loVIxgW5qvUEqcZH69tJ', 'active', 'owner', '2026-04-08T12:04:53.134509+00:00', '2026-04-09T12:33:03.961+00:00');
INSERT INTO "company_memberships" ("id", "company_id", "principal_type", "principal_id", "status", "membership_role", "created_at", "updated_at") VALUES ('9408e66f-8b9d-408b-a4b1-14d54346924b', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'user', 'UK2Hkjk8u7NNOmZzO7KtfxRbRZSRNCEj', 'active', 'member', '2026-04-09T12:32:29.553138+00:00', '2026-04-09T12:32:29.553138+00:00');

-- Documents
INSERT INTO "documents" ("id", "company_id", "title", "format", "latest_body", "latest_revision_number", "created_by_agent_id", "created_at", "updated_at") VALUES ('ecfa2bfb-bb8a-4d0d-abda-99e98471d83d', '85b9dfd2-6c89-4676-8358-3cb2b6495f86', NULL, 'markdown', '# Hiring Plan — PACA Automatizaciones

## Company Context

PACA builds n8n-powered AI automation workflows for clients. Current production client: Gonzalo Guinazu Inmobiliaria (6 workflows: WhatsApp bot with RAG, property sync, nightly cleanup, lead scraping, mass CV outreach).

The stack is n8n + Supabase + Google Gemini + ManyChat + various integrations.

## Org Structure (Target)

```
CEO
└── n8n Expert (founding engineer, IC)
└── Prompt Engineer (hire #2, when prompt volume justifies)
└── Workflow Engineer (hire #3, when new client projects ramp)
```

Flat structure. No middle management until 5+ engineers. Each specialist reports directly to CEO.

## Hire #1: n8n Expert (Founding Engineer)

**Why first:** Production system running. Needs someone who can maintain, debug, and extend n8n workflows immediately. Highest leverage hire.

**Responsibilities:**

* Maintain and debug the 6 production workflows (Gonzalo Guinazu)
* Build new workflows for incoming client work
* Integrate external services (APIs, webhooks, databases)
* Validate and test all workflow changes before deployment
* Document workflow logic

**Required capabilities:**

* n8n workflow creation, debugging, and optimization
* API integration (REST, webhooks)
* Supabase / PostgreSQL
* Error handling and retry strategies

**Access needed:** n8n MCP tools, Automatizaciones project workspace

**Status:** Hiring now.

## Hire #2: Prompt Engineer (Future)

**Trigger:** When we have 3+ AI-powered workflows with distinct prompt requirements, or when prompt iteration is consuming >30% of engineering time.

**Responsibilities:** Design and optimize prompts for AI nodes across all client projects.

## Hire #3: Workflow Engineer (Future)

**Trigger:** When we onboard a second active client project, or when the n8n Expert is at capacity and needs specs handed to them.

**Responsibilities:** Translate business requirements into workflow specifications. Bridge between client needs and technical implementation.

## Hiring Principles

1. **Hire for immediate need.** No speculative hires.
2. **ICs before managers.** Stay flat until coordination cost justifies management.
3. **One at a time.** Validate each hire is productive before adding the next.
4. **Skills over titles.** Match agent capabilities to actual work, not org charts.', 2, '017b9931-b2a8-47ce-a5dc-b5b703db9f94', '2026-04-01T22:15:29.854+00:00', '2026-04-01T22:55:21.554+00:00');

-- Budget policies
INSERT INTO "budget_policies" ("id", "company_id", "scope_type", "scope_id", "metric", "window_kind", "amount", "warn_percent", "hard_stop_enabled", "notify_enabled", "is_active", "created_at", "updated_at") VALUES ('8b29d227-8597-48f8-8fdd-c0419c6a8b31', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'agent', 'd48d6423-4826-4770-8844-66409d2c49ee', 'billed_cents', 'calendar_month_utc', 500, 80, true, true, true, '2026-04-06T17:51:00.130074+00:00', '2026-04-06T17:51:00.130074+00:00');

-- Routines
INSERT INTO "routines" ("id", "company_id", "project_id", "goal_id", "title", "description", "assignee_agent_id", "priority", "status", "concurrency_policy", "catch_up_policy", "created_at", "updated_at") VALUES ('917872d2-f34b-4d33-85db-d61750184b02', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', '0b4583ca-b268-4d77-8a36-32f3b8de504b', NULL, 'Semanal security review', 'haz un analisis de securidad semanal, (solo lectura) y guardalo el fix de las vulnerabilidades encntradas en /Users/pacosemino/Desktop/Rosental/appminuta/Documentaciones/Implementaciones (utiliza sonnet 4.6)', 'e6a83e03-3b51-4e02-96a8-dd7da4cdd2ee', 'medium', 'active', 'coalesce_if_active', 'skip_missed', '2026-04-02T03:30:02.138104+00:00', '2026-04-06T06:00:39.375+00:00');

-- Issue comments
INSERT INTO "issue_comments" ("id", "company_id", "issue_id", "author_agent_id", "author_user_id", "body", "created_at", "updated_at") VALUES ('977a81ef-e286-40cd-85b4-8a2b46dccf07', '85b9dfd2-6c89-4676-8358-3cb2b6495f86', '306ecc73-e34d-489a-8f2f-34e1965aeb03', '017b9931-b2a8-47ce-a5dc-b5b703db9f94', NULL, '## Progress update

All three deliverables complete. Pending board approval on the first hire.

### 1. Hiring plan

Published to [plan document](/PACA/issues/PACA-1#document-plan). Flat org: CEO → n8n Expert (hire #1) → Prompt Engineer (#2) → Workflow Engineer (#3). ICs first, no middle management until 5+ engineers.

### 2. First hire: n8n Expert

- Agent: [n8n Expert](/PACA/agents/n8n-expert) — `pending_approval`
- Approval: [f4b4265e](/PACA/approvals/f4b4265e-cba8-426c-94ca-80c5a3e44960)
- Role: engineer, claude-sonnet-4-6, workspace at `/Users/pacosemino/Desktop/Automatizaciones`
- Reports to CEO. First task on approval: [PACA-2](/PACA/issues/PACA-2) (production audit)

### 3. Roadmap tasks created

- [PACA-2](/PACA/issues/PACA-2) — Audit production workflows (high, unassigned → n8n Expert)
- [PACA-3](/PACA/issues/PACA-3) — Run embedding batch for new properties (medium)
- [PACA-4](/PACA/issues/PACA-4) — Verify Tokko Sync and cleanup reliability (medium)

### 4. Project setup

- Created [Automatizaciones](/PACA/projects/automatizaciones) project with workspace pointing to `/Users/pacosemino/Desktop/Automatizaciones`

### Next

Waiting on board approval for the n8n Expert hire. Once approved, I will assign [PACA-2](/PACA/issues/PACA-2) and onboard the engineer.', '2026-04-01T22:17:28.702708+00:00', '2026-04-01T22:17:28.702708+00:00');
INSERT INTO "issue_comments" ("id", "company_id", "issue_id", "author_agent_id", "author_user_id", "body", "created_at", "updated_at") VALUES ('4c5853cc-7e87-474d-bf32-b37fcd63f70d', '85b9dfd2-6c89-4676-8358-3cb2b6495f86', '306ecc73-e34d-489a-8f2f-34e1965aeb03', '017b9931-b2a8-47ce-a5dc-b5b703db9f94', NULL, 'Blocked on board approval for n8n Expert hire ([f4b4265e](/PACA/approvals/f4b4265e-cba8-426c-94ca-80c5a3e44960)). All other deliverables complete: hiring plan, roadmap tasks, project setup.', '2026-04-01T22:17:46.851138+00:00', '2026-04-01T22:17:46.851138+00:00');
INSERT INTO "issue_comments" ("id", "company_id", "issue_id", "author_agent_id", "author_user_id", "body", "created_at", "updated_at") VALUES ('dd8024ec-ded2-4ed2-a281-e3e03e0b203d', '85b9dfd2-6c89-4676-8358-3cb2b6495f86', '306ecc73-e34d-489a-8f2f-34e1965aeb03', '017b9931-b2a8-47ce-a5dc-b5b703db9f94', NULL, '## Unblocked — all hires approved

n8n Expert hire ([f4b4265e](/PACA/approvals/f4b4265e-cba8-426c-94ca-80c5a3e44960)) approved by board. All deliverables from this task are complete:

1. Hiring plan — published to [plan document](/PACA/issues/PACA-1#document-plan)
2. First hire (n8n Expert) — approved and active
3. Roadmap tasks — created and now assigned across the team
4. Project setup — [Automatizaciones](/PACA/projects/automatizaciones) active

Additional hires completed in [PACA-5](/PACA/issues/PACA-5). Full team is operational.', '2026-04-01T22:38:15.756609+00:00', '2026-04-01T22:38:15.756609+00:00');
INSERT INTO "issue_comments" ("id", "company_id", "issue_id", "author_agent_id", "author_user_id", "body", "created_at", "updated_at") VALUES ('6db0ca84-1c44-494a-8017-0ae72f32aacb', 'aa76d3cd-4273-4443-83c8-70931173e770', '89a732a0-b685-4793-a937-f8e74e3c2279', '5bce5e22-7238-4114-8f12-35d63ec54e54', NULL, 'Hiring plan complete — 14 agents submitted for board approval. Full plan in document.', '2026-04-02T03:22:16.159153+00:00', '2026-04-02T03:22:16.159153+00:00');
INSERT INTO "issue_comments" ("id", "company_id", "issue_id", "author_agent_id", "author_user_id", "body", "created_at", "updated_at") VALUES ('f2b92ec8-4124-4b76-8394-5a923b6e6618', 'aa76d3cd-4273-4443-83c8-70931173e770', '89a732a0-b685-4793-a937-f8e74e3c2279', '5bce5e22-7238-4114-8f12-35d63ec54e54', NULL, '## Full Hiring Plan — Gestor de Vinotecas

**14 agents** submitted for board approval. All are `pending_approval`.

### Org Chart
```
CEO
└── Orchestrator — Lead Engineer, single entry point
    ├── BackendArchitect — Express 5 + Prisma + Zod
    ├── BackendPlanner — Strategic planning + SQL review
    ├── DBArchitect — PostgreSQL + Supabase + migrations
    ├── FrontendPlanner — React MFE planning
    ├── MFEArchitect — Module Federation + Webpack
    ├── SecurityEngineer — OWASP + JWT + RBAC + multi-tenant
    ├── QATester — Jest + Supertest + E2E
    ├── UXUIDesigner — React UX/UI + design system
    ├── DiagramArchitect — Mermaid + PlantUML + ASCII
    ├── DocsEngineer — OpenAPI + architecture docs
    ├── PenTester — Authorized offensive security testing
    ├── PerformanceEngineer — Profiling + bundle + query optimization
    └── PromptEngineer — LLM prompts + AI features
```

### How Work Flows
- Board assigns tasks to **Orchestrator** (or CEO escalates)
- Orchestrator picks mode: LECTURA / PLANIFICACION / IMPLEMENTACION / DEBUG / AUDITORIA
- PLANIFICACION always requires explicit board approval before execution
- DB migrations always shown as full SQL for manual review before running

### Pending Approvals
- [Orchestrator](/VIN/approvals/c2f4a2d4-07f1-4233-a38c-6141d4720b83)
- [BackendArchitect](/VIN/approvals/e9480954-ffd2-4817-9113-28d9ff59c6af)
- [BackendPlanner](/VIN/approvals/5693f3fb-607c-4d49-b9f0-23e7a43fb9a0)
- [DBArchitect](/VIN/approvals/c163af22-3edb-433e-98bc-856e8670a005)
- [FrontendPlanner](/VIN/approvals/a9849234-fd1d-4894-9e44-8a920627e545)
- [MFEArchitect](/VIN/approvals/3a53fa76-a30b-46b2-8306-d836ec53bf0a)
- [SecurityEngineer](/VIN/approvals/dd04edd7-dd14-4c0e-9efa-9d7a8129950e)
- [QATester](/VIN/approvals/a09dc6a6-af18-4429-9fcb-2f689b81ee9c)
- [UXUIDesigner](/VIN/approvals/5999ea30-d54e-432c-8302-9b050c079878)
- [DiagramArchitect](/VIN/approvals/a5a50964-9c3d-41f5-bda8-689a4addb1ef)
- [DocsEngineer](/VIN/approvals/09b24fb2-adc5-4cc7-9b9a-b3db81f4f395)
- [PenTester](/VIN/approvals/4331f951-cd55-4a96-be83-da09181a102a)
- [PerformanceEngineer](/VIN/approvals/0cf7aa87-a7d8-4315-8575-02099af91d5b)
- [PromptEngineer](/VIN/approvals/058137f0-5339-45dd-bf1e-921a712a9923)

### Next Actions
1. Board approves 14 hire requests above
2. Assign Phase 7 (POS) to Orchestrator — currently active per `.planning/STATE.md`
3. Orchestrator reads roadmap, dispatches BackendArchitect + UXUIDesigner + QATester', '2026-04-02T03:22:35.763735+00:00', '2026-04-02T03:22:35.763735+00:00');
INSERT INTO "issue_comments" ("id", "company_id", "issue_id", "author_agent_id", "author_user_id", "body", "created_at", "updated_at") VALUES ('22cf5c89-a7bc-40c3-af03-6c7f240abda9', 'aa76d3cd-4273-4443-83c8-70931173e770', '19cfd6fd-746d-43eb-81e1-963334d18d09', '5bce5e22-7238-4114-8f12-35d63ec54e54', NULL, '## Análisis completo — 14 subtareas creadas

Revisé el codebase completo de Gestor de Vinotecas (`/Users/pacosemino/Desktop/Gestor`) e identifiqué todos los módulos a revisar.

**Stack:** Express 5 + Prisma backend, React 19 + Module Federation frontend (11 MFEs), PostgreSQL.

**Subtareas creadas (asignadas al CEO para ejecución secuencial):**

- [VIN-3](/VIN/issues/VIN-3) — Auth Module (login, JWT, RBAC, refresh)
- [VIN-4](/VIN/issues/VIN-4) — Clients Module
- [VIN-5](/VIN/issues/VIN-5) — Wines & Wineries Module
- [VIN-6](/VIN/issues/VIN-6) — Products & Combos Module
- [VIN-7](/VIN/issues/VIN-7) — Inventory Module
- [VIN-8](/VIN/issues/VIN-8) — Orders Module
- [VIN-9](/VIN/issues/VIN-9) — Purchases Module
- [VIN-10](/VIN/issues/VIN-10) — POS / Sales Module
- [VIN-11](/VIN/issues/VIN-11) — Prices Module
- [VIN-12](/VIN/issues/VIN-12) — Recipes & Formula Engine
- [VIN-13](/VIN/issues/VIN-13) — Reports Module
- [VIN-14](/VIN/issues/VIN-14) — Settings, Roles & Organizations
- [VIN-15](/VIN/issues/VIN-15) — Finance Module
- [VIN-16](/VIN/issues/VIN-16) — Notifications & Workflows

Cada tarea incluye pasos detallados, casos de prueba con usuario `paco.semino@gmail.com`, y prefijo `test-{modulo}` para impactos en BD.', '2026-04-02T04:06:47.043486+00:00', '2026-04-02T04:06:47.043486+00:00');
INSERT INTO "issue_comments" ("id", "company_id", "issue_id", "author_agent_id", "author_user_id", "body", "created_at", "updated_at") VALUES ('b1a4d2c9-c3de-42d0-917a-7faa0e2f62e6', 'aa76d3cd-4273-4443-83c8-70931173e770', 'db4d6e49-87e5-497a-a952-03145071dbcc', '5bce5e22-7238-4114-8f12-35d63ec54e54', NULL, '## Auth Module Review — Done

**5 bugs found and fixed.**

### Bugs Fixed

1. **[SECURITY] Lazy re-hash direction inverted** — `service.ts:282`  
   `storedRounds > TARGET_ROUNDS` → `< TARGET_ROUNDS`. The old code silently *downgraded* bcrypt strength on each login. Fixed to upgrade.

2. **[BUG] activateInvitation hardcoded bcrypt rounds** — `service.ts:436`  
   Hardcoded `bcrypt.hash(password, 10)` regardless of env. Now uses `BCRYPT_ROUNDS` constant (8 in dev, 10 in prod), consistent with `register`.

3. **[BUG] clearAuthStorage() left stale data** — `api-client/src/client.ts:245`  
   On refresh failure + forced logout, only `gestor_token` and `gestor_refresh` were cleared. `gestor_user`, `gestor_org`, `gestor_permissions`, `gestor_modules`, `gestor_memberships` remained in localStorage. Fixed to clear all 7 keys.

4. **[BUG] Session migration incomplete** — `apps/shell/src/App.tsx:26`  
   When removing the legacy `gestor_auth` key, `gestor_token` and `gestor_refresh` were not also cleared (diverged from test expectation). Fixed.

5. **[BUG] AuthGuard bypassed by expired tokens** — `apps/shell/src/components/AuthGuard.tsx`  
   `isAuthenticated` only checked for token existence, not expiry. A user with an expired JWT in localStorage could navigate to protected routes (every subsequent API call would 401, but the guard let them through). Fixed to also call `isTokenExpired(accessToken)`.

### No action needed
- JWT, refresh token, and RBAC flows are correct
- Rate limiting on auth routes is in place
- Membership cache + role cache work correctly
- Token refresh mutex pattern in api-client is solid
- Cross-MFE auth sync (gestor_auth_change event) works correctly', '2026-04-02T04:12:22.169867+00:00', '2026-04-02T04:12:22.169867+00:00');
INSERT INTO "issue_comments" ("id", "company_id", "issue_id", "author_agent_id", "author_user_id", "body", "created_at", "updated_at") VALUES ('b7fc17ee-6865-43e7-a7ca-d287f8e080f7', 'aa76d3cd-4273-4443-83c8-70931173e770', '2b0f15b2-dab3-45b5-b4c1-94998e128114', '5bce5e22-7238-4114-8f12-35d63ec54e54', NULL, '## Clients Module — Revisión completa ✓

**CRUD verificado OK:** crear, listar, editar, eliminar, búsqueda, filtros por tipo, paginación, historial de compras, gestión de direcciones.

**Bugs encontrados y corregidos (commit `347fdb0`):**

- **`birthday` validation** (`validators.ts`): `z.string().datetime()` rechazaba formato `YYYY-MM-DD` que envía el frontend. Fix: regex + transform a ISO completo.
- **Email case-sensitivity** (`auth/service.ts`): login fallaba si el email tenía distinta capitalización. Fix: normalizar a lowercase en login y register.
- **`customFields` vs `customFieldValues`** (`ClientDetail.tsx`): el frontend mostraba campos personalizados buscando `client.customFields` (objeto) pero el backend devuelve `customFieldValues` (array). Fix: corregir referencia y lógica de render.
- **Birthday prefill** (`ClientForm.tsx`): al editar, `existing.birthday` devuelve ISO completo pero `input[type=date]` necesita `YYYY-MM-DD`. Fix: `.slice(0, 10)`.

**Multi-tenancy:** confirmado — todas las queries filtran por `orgId`, middleware chain correcto.

**Mejoras incluidas:** token expiry check en AuthGuard, cleanup completo de localStorage al logout.', '2026-04-02T04:24:37.343764+00:00', '2026-04-02T04:24:37.343764+00:00');
INSERT INTO "issue_comments" ("id", "company_id", "issue_id", "author_agent_id", "author_user_id", "body", "created_at", "updated_at") VALUES ('e0a5b5e6-5101-4ad1-812d-96c3fb03bb1b', 'aa76d3cd-4273-4443-83c8-70931173e770', '2b0f15b2-dab3-45b5-b4c1-94998e128114', '5bce5e22-7238-4114-8f12-35d63ec54e54', NULL, '## Clients Module — Revisión completa

CRUD verificado vía API: listar, crear, editar, eliminar, búsqueda, filtros por tipo, paginación, historial de compras, direcciones — todo OK.

**Bugs corregidos (commit `347fdb0`):**

- `birthday` rechazaba `YYYY-MM-DD` — fix: regex + transform a ISO en validator
- Login case-sensitive por email — fix: normalizar a lowercase en auth service
- `client.customFields` → `client.customFieldValues` en ClientDetail (mismatch backend/frontend)
- Prefill de birthday en edit form recortado a `YYYY-MM-DD` para `input[type=date]`

**Multi-tenancy:** confirmado por `orgId` en todas las queries.

Pasando a siguiente módulo.', '2026-04-02T04:24:48.012437+00:00', '2026-04-02T04:24:48.012437+00:00');
INSERT INTO "issue_comments" ("id", "company_id", "issue_id", "author_agent_id", "author_user_id", "body", "created_at", "updated_at") VALUES ('eeae3111-6fb5-46cc-981f-ef227d41e95a', 'aa76d3cd-4273-4443-83c8-70931173e770', '5a12dcfd-3027-4329-b941-c0c6e6ab5ff7', '5bce5e22-7238-4114-8f12-35d63ec54e54', NULL, '## Wines & Wineries Module — Revisión completa ✓

CRUD verificado vía API + lectura de código completa. **3 bugs encontrados y corregidos** (commit `4377eda`).

### Bugs corregidos

1. **[BUG] `deleteWinery` bloqueaba borrado con vinos inactivos** (`wineries/service.ts:76`)
   El count no filtraba por `isActive: true`, por lo que vinos soft-deleted impedían eliminar la bodega. Fix: `where: { orgId, wineryId: id, isActive: true }`.

2. **[BUG] `listWineries` no incluía `_count.wines`** (`wineries/service.ts:22`)
   La UI en WineryList mostraba `0 Vinos` en todas las bodegas. Fix: agregar `include: { _count: { select: { wines: { where: { isActive: true } } } } }`.

3. **[BUG] Búsqueda de bodegas solo filtraba la página actual** (`WineryList.tsx`)
   El `search` state no se enviaba al API; se filtraba cliente-side sobre la página cargada. Fix: pasar `search` como parámetro a `wineriesApi.list()` + reset página a 1 al buscar.

### Sin acción requerida
- CRUD completo de vinos y bodegas funciona correctamente
- Asociación vino-bodega correcta
- Filtros (varietal, DO, bodega, búsqueda) funcionan
- Tasting notes (crear, listar) OK
- Multi-tenancy: `orgId` en todas las queries ✓
- Validación de varietal sum > 100% funciona ✓
- Duplicado de nombre en bodega/vino devuelve 409 correctamente', '2026-04-02T04:39:15.84088+00:00', '2026-04-02T04:39:15.84088+00:00');
INSERT INTO "issue_comments" ("id", "company_id", "issue_id", "author_agent_id", "author_user_id", "body", "created_at", "updated_at") VALUES ('559fdf6e-a90d-46a0-a66a-cd6e3fe091e8', 'aa76d3cd-4273-4443-83c8-70931173e770', 'e2c6e5d8-2416-4c52-9d13-2898fdd37516', '5bce5e22-7238-4114-8f12-35d63ec54e54', NULL, '## Delegación a QATester

Este módulo requiere acceso directo al codebase y pruebas funcionales reales. Delegando a QATester para ejecución técnica.

**Pasos a ejecutar:**
1. CRUD completo de productos
2. Crear y gestionar combos/bundles
3. Asociación producto-vino
4. Precios base en productos
5. Categorías y clasificación
6. Disponibilidad y stock linking con inventario
7. Corregir todos los bugs encontrados
8. Prefixar impactos en BD con `test-products-{descripcion}`

**Credenciales de prueba:** paco.semino@gmail.com / Macluctoc&510&

Reportar resultados y bugs corregidos al completar.', '2026-04-02T04:44:50.377493+00:00', '2026-04-02T04:44:50.377493+00:00');
INSERT INTO "issue_comments" ("id", "company_id", "issue_id", "author_agent_id", "author_user_id", "body", "created_at", "updated_at") VALUES ('88f46c7c-4e20-41e4-b90a-f29b44f71f75', 'aa76d3cd-4273-4443-83c8-70931173e770', '6e401772-ca5d-48e1-aaa2-f99d64fe0929', '5bce5e22-7238-4114-8f12-35d63ec54e54', NULL, 'Delegating to QATester.

- **Task**: Review Inventory Module (mfe-inventory + backend/src/modules/inventory/)
- **Scope**: Test stock visibility, movements (entrada/salida/ajuste), alertas de stock mínimo, historial, reconciliación, integración con órdenes y compras
- **Fix all bugs found**
- **Credentials**: paco.semino@gmail.com / Macluctoc&510&
- **cwd**: /Users/pacosemino/Desktop/Gestor
- **DB prefix**: `test-inventory-{descripcion}` for any DB changes
- Complete and mark done when finished.', '2026-04-02T04:46:32.31685+00:00', '2026-04-02T04:46:32.31685+00:00');
INSERT INTO "issue_comments" ("id", "company_id", "issue_id", "author_agent_id", "author_user_id", "body", "created_at", "updated_at") VALUES ('074efa61-4557-401c-84e2-0d178ad232eb', 'aa76d3cd-4273-4443-83c8-70931173e770', 'e2c6e5d8-2416-4c52-9d13-2898fdd37516', 'c4f12073-b2b2-4e0d-81dd-81d7fa182480', NULL, '## Products & Combos Module — Review Complete

### Hallazgos

- **Products module**: CRUD completo y funcional — service, controller, routes, validators en orden. Soft delete implementado. Custom fields con upsert. Recipe management con recalculo de costo en `$transaction`.
- **Combos module**: **directorio vacío** — el modelo Prisma existe (`combos`, `combo_items`) pero faltaban todos los archivos de implementación. No estaba registrado en `index.ts`.

### Correcciones implementadas

1. **Creado módulo completo de combos**:
   - `backend/src/modules/combos/validators.ts` — schemas Zod para create/update/filters
   - `backend/src/modules/combos/service.ts` — CRUD + validación de ownership de productos + soft delete
   - `backend/src/modules/combos/controller.ts` — handlers Express
   - `backend/src/modules/combos/routes.ts` — rutas con auth + tenant + permisos

2. **Registrado en `index.ts`**: `orgRouter.use("/combos", requireModule("products"), combosRouter)`

3. **Tests escritos y ejecutados**:
   - `products.service.test.ts` — 27 tests: list/get/create/update/delete/setRecipe con multi-tenant isolation
   - `combos.service.test.ts` — 21 tests: list/get/create/update/delete con validación de ownership cross-org

### Resultado

```
Test Suites: 21 passed, 21 total
Tests:       138 passed, 48 nuevos (products + combos)
```

TypeScript sin errores (`tsc --noEmit` limpio).

**Bug principal corregido**: El módulo de combos estaba completamente ausente a pesar de existir el modelo Prisma.', '2026-04-02T04:50:42.034611+00:00', '2026-04-02T04:50:42.034611+00:00');
INSERT INTO "issue_comments" ("id", "company_id", "issue_id", "author_agent_id", "author_user_id", "body", "created_at", "updated_at") VALUES ('2699b8e7-e66c-4314-9f10-6d60592131df', 'aa76d3cd-4273-4443-83c8-70931173e770', 'b50301c7-23ba-4b29-8a9d-5912b8978d14', '5bce5e22-7238-4114-8f12-35d63ec54e54', NULL, '## Orders Module — Review completo

**6 bugs encontrados y corregidos. Flujo completo testeado y validado.**

### Bugs corregidos

**Bug #1 (crítico)** — `requireModule` corría antes de `authMiddleware` en `index.ts`. Todos los endpoints con `requireModule` (orders, products, finance, recipes) devolvían 401. Fix: agregar `authMiddleware` al `orgRouter` antes de los subrouters.

**Bug #2** — `OrderDetail` nunca mostraba botones de transición. Backend retorna `transitionsFrom` (nombre de relación Prisma) pero el tipo TypeScript espera `transitions`. Fix: remap en `getOrder` service.

**Bug #3** — Búsqueda de cliente en `OrderForm` no funcional (`clientId` era `const` vacío). Fix: reescritura con `useQuery` + debounce + dropdown.

**Bug #4** — Items del pedido nunca vinculaban `productId` (campo solo de texto). Stock deduction roto. Fix: product search con dropdown, selección popula `productId` + `unitPrice`.

**Bug #5** — Prisma `Decimal` serializa como string. `unitPrice` llegaba como `"3500"` al backend, fallando validación Zod. Fix: `Number(p.price)` al seleccionar producto.

**Bug #6** — `navigate("/")` en `OrderForm` llevaba al dashboard en vez de la lista de pedidos. Fix: `navigate("..")` relativo.

### Setup requerido (hecho en BD de test)
- Módulo `orders` habilitado para la org
- Módulo `products` habilitado
- Permisos `settings.create/delete/manage` agregados al rol owner
- Workflow template creado: Borrador → Confirmada → Enviada → Entregada → Facturada (+ Cancelada desde primeros 3 pasos)

### Test data creada
- `test-orders-Malbec Reserva 750ml` — producto de prueba
- `test-orders-orden-basica` — orden completada (Facturada)
- `test-orders-con-cliente-y-descuento` — orden cancelada con cliente real y descuento
- Flujo Borrador→Confirmada→Enviada→Entregada→Facturada: ✅
- Cancelación desde múltiples pasos: ✅
- Cálculo subtotal/descuento/total: ✅ ($10.500 - $500 = $10.000)
- Búsqueda por cliente: ✅
- Transición inválida (error esperado): ✅
- Creación y transición desde UI: ✅', '2026-04-02T05:11:03.693931+00:00', '2026-04-02T05:11:03.693931+00:00');
INSERT INTO "issue_comments" ("id", "company_id", "issue_id", "author_agent_id", "author_user_id", "body", "created_at", "updated_at") VALUES ('ce71dabe-012e-4988-a07b-09bb2e842970', 'aa76d3cd-4273-4443-83c8-70931173e770', 'b50301c7-23ba-4b29-8a9d-5912b8978d14', '5bce5e22-7238-4114-8f12-35d63ec54e54', NULL, '## Orders Module — Review completo

6 bugs encontrados y corregidos. Flujo completo testeado E2E.

### Bugs corregidos

- **Bug #1 (crítico)** `requireModule` corría antes de `authMiddleware` — todos los endpoints con module guard devolvían 401. Fix: `authMiddleware` en `orgRouter` antes de subrouters en `index.ts`.
- **Bug #2** Botones de transición nunca aparecían en `OrderDetail` — backend retorna `transitionsFrom` pero tipo espera `transitions`. Fix: remap en `getOrder` service.
- **Bug #3** Client search no funcional (`clientId = const ""`). Fix: `useQuery` + debounce + dropdown.
- **Bug #4** Items no vinculaban `productId` (solo texto). Stock deduction roto. Fix: product search dropdown con selección.
- **Bug #5** `unitPrice` llegaba como string Decimal. Fix: `Number(p.price)`.
- **Bug #6** `navigate("/")` post-create iba al dashboard. Fix: `navigate("..")`.

### Test data (prefijo test-orders-)
- Flujo completo Borrador→Facturada: OK
- Cancelación con restore_stock: OK
- Descuentos y totales: OK
- Búsqueda de pedidos: OK
- Validación de transición inválida: OK
- Creación y transición desde UI: OK', '2026-04-02T05:11:13.526034+00:00', '2026-04-02T05:11:13.526034+00:00');
INSERT INTO "issue_comments" ("id", "company_id", "issue_id", "author_agent_id", "author_user_id", "body", "created_at", "updated_at") VALUES ('c9ff0ba2-1079-4e01-b810-5125d7bd0e68', 'aa76d3cd-4273-4443-83c8-70931173e770', 'b50301c7-23ba-4b29-8a9d-5912b8978d14', '5bce5e22-7238-4114-8f12-35d63ec54e54', NULL, 'Orders module review complete. Fixed 6 bugs: auth middleware ordering, workflow transitions field remap, client search, product lookup with ID binding, Decimal-to-number cast, and post-create navigation. Full E2E tested via API and UI.', '2026-04-02T05:12:57.63059+00:00', '2026-04-02T05:12:57.63059+00:00');
INSERT INTO "issue_comments" ("id", "company_id", "issue_id", "author_agent_id", "author_user_id", "body", "created_at", "updated_at") VALUES ('e4183414-c583-4a66-bde3-f27572d9a41c', 'aa76d3cd-4273-4443-83c8-70931173e770', '60c3944e-1e9a-4e1b-b4d9-fc9ea95db4ac', '5bce5e22-7238-4114-8f12-35d63ec54e54', NULL, 'Delegating to QATester.

**Module:** Purchases (mfe-purchases + backend/src/modules/purchases/)
**App:** /Users/pacosemino/Desktop/Gestor
**Credentials:** paco.semino@gmail.com / Macluctoc&510&

**Test scope:**
- Crear orden de compra a proveedor
- Recepción parcial y total de mercadería
- Actualización de inventario al recibir
- Gestión de proveedores
- Historial de compras y estado
- Devoluciones a proveedor
- Find and fix all bugs
- Prefix DB changes with `test-purchases-{description}`', '2026-04-02T07:27:38.046848+00:00', '2026-04-02T07:27:38.046848+00:00');
INSERT INTO "issue_comments" ("id", "company_id", "issue_id", "author_agent_id", "author_user_id", "body", "created_at", "updated_at") VALUES ('8d4cd246-25f9-4c1f-a178-f8da6adcbbe0', 'aa76d3cd-4273-4443-83c8-70931173e770', 'ed3386ef-b558-4be6-beed-286038b33c39', '5bce5e22-7238-4114-8f12-35d63ec54e54', NULL, 'Delegating to QATester.

**Module:** POS / Sales Module (mfe-pos + backend/src/modules/sales/)
**App:** /Users/pacosemino/Desktop/Gestor
**Credentials:** paco.semino@gmail.com / Macluctoc&510&

**Test scope:** POS transactions, cash/card payments, order flow, daily close, Z report, refunds

- Find and fix all bugs
- Prefix DB changes with `test-pos-sales-{description}`', '2026-04-02T07:28:20.55863+00:00', '2026-04-02T07:28:20.55863+00:00');
INSERT INTO "issue_comments" ("id", "company_id", "issue_id", "author_agent_id", "author_user_id", "body", "created_at", "updated_at") VALUES ('4c684dc1-3296-4edd-bcde-e2a65be6dec0', 'aa76d3cd-4273-4443-83c8-70931173e770', 'd56cc781-9803-4e09-9053-542794cabd30', '5bce5e22-7238-4114-8f12-35d63ec54e54', NULL, 'Delegating to QATester.

**Module:** Prices Module (mfe-prices + backend/src/modules/prices/)
**App:** /Users/pacosemino/Desktop/Gestor
**Credentials:** paco.semino@gmail.com / Macluctoc&510&

**Test scope:** Price lists, price rules, margin/markup, price by client/segment, bulk update

- Find and fix all bugs
- Prefix DB changes with `test-prices-{description}`', '2026-04-02T07:28:20.598253+00:00', '2026-04-02T07:28:20.598253+00:00');
INSERT INTO "issue_comments" ("id", "company_id", "issue_id", "author_agent_id", "author_user_id", "body", "created_at", "updated_at") VALUES ('584a30bd-f946-4e1d-9317-fa9376b37bed', 'aa76d3cd-4273-4443-83c8-70931173e770', 'fa0d6905-2713-4837-8eba-51685f0af09e', '5bce5e22-7238-4114-8f12-35d63ec54e54', NULL, 'Delegating to QATester.

**Module:** Recipes & Formula Engine (mfe-recipes + backend/src/modules/recipes/)
**App:** /Users/pacosemino/Desktop/Gestor
**Credentials:** paco.semino@gmail.com / Macluctoc&510&

**Test scope:** Recipe CRUD, ingredient cost calc, yield/waste, batch scaling, recipe-to-inventory link

- Find and fix all bugs
- Prefix DB changes with `test-recipes-{description}`', '2026-04-02T07:28:20.630676+00:00', '2026-04-02T07:28:20.630676+00:00');
INSERT INTO "issue_comments" ("id", "company_id", "issue_id", "author_agent_id", "author_user_id", "body", "created_at", "updated_at") VALUES ('d21eb98f-3ffc-4df5-b32b-0dcf865322f7', 'aa76d3cd-4273-4443-83c8-70931173e770', '57ee0940-1976-493d-bf68-285b55132c7c', '5bce5e22-7238-4114-8f12-35d63ec54e54', NULL, 'Delegating to QATester.

**Module:** Reports Module (mfe-reports + backend/src/modules/reports/)
**App:** /Users/pacosemino/Desktop/Gestor
**Credentials:** paco.semino@gmail.com / Macluctoc&510&

**Test scope:** All report types, filters, date ranges, export CSV/PDF, data accuracy

- Find and fix all bugs
- Prefix DB changes with `test-reports-{description}`', '2026-04-02T07:28:20.662566+00:00', '2026-04-02T07:28:20.662566+00:00');
INSERT INTO "issue_comments" ("id", "company_id", "issue_id", "author_agent_id", "author_user_id", "body", "created_at", "updated_at") VALUES ('2ac4dee8-6e36-4535-9c84-eb07637c42f4', 'aa76d3cd-4273-4443-83c8-70931173e770', 'ea2fea7d-ce58-4f94-8e7f-4e30f71fbf73', '5bce5e22-7238-4114-8f12-35d63ec54e54', NULL, 'Delegating to QATester.

**Module:** Settings, Roles & Organizations (mfe-settings + backend/src/modules/settings/)
**App:** /Users/pacosemino/Desktop/Gestor
**Credentials:** paco.semino@gmail.com / Macluctoc&510&

**Test scope:** Roles, permissions, org config, user management, CRUD for all settings entities

- Find and fix all bugs
- Prefix DB changes with `test-settings-{description}`', '2026-04-02T07:28:20.702421+00:00', '2026-04-02T07:28:20.702421+00:00');
INSERT INTO "issue_comments" ("id", "company_id", "issue_id", "author_agent_id", "author_user_id", "body", "created_at", "updated_at") VALUES ('aafac9ff-3a5e-4b7a-b30e-911c64da1212', 'aa76d3cd-4273-4443-83c8-70931173e770', '66e3f782-0b86-48de-afcf-733fc59b1d5d', '5bce5e22-7238-4114-8f12-35d63ec54e54', NULL, 'Delegating to QATester.

**Module:** Finance Module (mfe-finance + backend/src/modules/finance/)
**App:** /Users/pacosemino/Desktop/Gestor
**Credentials:** paco.semino@gmail.com / Macluctoc&510&

**Test scope:** Accounts, transactions, cash flow, P&L, reconciliation, financial reports

- Find and fix all bugs
- Prefix DB changes with `test-finance-{description}`', '2026-04-02T07:28:20.732719+00:00', '2026-04-02T07:28:20.732719+00:00');
INSERT INTO "issue_comments" ("id", "company_id", "issue_id", "author_agent_id", "author_user_id", "body", "created_at", "updated_at") VALUES ('5f755dd8-d127-4e06-8d7c-e5308be4bc36', 'aa76d3cd-4273-4443-83c8-70931173e770', 'acd237ab-a848-4561-b0d4-1d8a325b6e2e', '5bce5e22-7238-4114-8f12-35d63ec54e54', NULL, 'Delegating to QATester.

**Module:** Notifications & Workflows (mfe-notifications + backend/src/modules/notifications/)
**App:** /Users/pacosemino/Desktop/Gestor
**Credentials:** paco.semino@gmail.com / Macluctoc&510&

**Test scope:** Notification CRUD, triggers, delivery, workflow automations, alert rules

- Find and fix all bugs
- Prefix DB changes with `test-notifications-{description}`', '2026-04-02T07:28:20.765428+00:00', '2026-04-02T07:28:20.765428+00:00');
INSERT INTO "issue_comments" ("id", "company_id", "issue_id", "author_agent_id", "author_user_id", "body", "created_at", "updated_at") VALUES ('ad486043-aeb5-44e6-90ed-5ac4173ecb98', 'aa76d3cd-4273-4443-83c8-70931173e770', '66e3f782-0b86-48de-afcf-733fc59b1d5d', 'c4f12073-b2b2-4e0d-81dd-81d7fa182480', NULL, '## Finance Module Review — Done

**Tests:** 19/19 passing (`finance.service.test.ts`)

### Bugs found and fixed

**Bug 1 (Critical) — `createTransaction`: `categoryId` could crash Prisma**
- `validators.ts`: `categoryId` was `optional()` but the DB column is non-nullable
- Service used a non-null assertion `data.categoryId!` — passing `undefined` at runtime causes a Prisma error
- Fix: made `categoryId` required (`z.string().uuid()`) in `createTransactionSchema` and removed the `!` from service

**Bug 2 (Minor) — `createCategory` validator accepted dead `color` field**
- `createCategorySchema` had `color: z.string().max(7).optional()`
- `FinancialCategory` model has no `color` column — field was silently dropped on every create
- Fix: removed `color` from the schema

### Test coverage added
- `listCategories`: list + tenant isolation
- `createCategory`: happy path (INCOME/EXPENSE), type lowercased correctly
- `listTransactions`: pagination, type filter, categoryId filter, date range, tenant isolation
- `createTransaction`: happy path, default date, custom date, empty description, missing categoryId throws
- `getBalance`: income/expense/net, zero values, date range, lowercase type queries, tenant isolation

**Files changed:**
- `backend/src/modules/finance/validators.ts` — categoryId required, color removed
- `backend/src/modules/finance/service.ts` — removed `!` from categoryId
- `backend/src/__tests__/finance.service.test.ts` — new test file (19 tests)', '2026-04-02T07:33:17.960311+00:00', '2026-04-02T07:33:17.960311+00:00');
INSERT INTO "issue_comments" ("id", "company_id", "issue_id", "author_agent_id", "author_user_id", "body", "created_at", "updated_at") VALUES ('eddf2f73-0875-4884-a3e6-b1b39e619d5c', 'aa76d3cd-4273-4443-83c8-70931173e770', '3738de92-0fb9-4aca-8860-e258aca21179', '5bce5e22-7238-4114-8f12-35d63ec54e54', NULL, '## Token optimization complete

All 15 agents optimized to reduce token consumption on the $100/mo Claude Code plan.

**Config changes applied:**
- `maxTurnsPerRun` slashed across the board (CEO: 300→40, Orchestrator: 200→60, specialists: 150→80, utilities: 100→40-60)
- DiagramArchitect + DocsEngineer switched to `claude-haiku-4-5-20251001` (simple output tasks, no deep reasoning needed)
- Heartbeat polling interval increased from 1h → 4h (CEO/Orchestrator) or 24h (all specialists) — `wakeOnDemand` stays true so assignment response is unaffected

**Instruction file changes:**
- Added `TOKEN BUDGET` section to all 14 agent `.md` files in `/Users/pacosemino/Desktop/Gestor/.claude/agents/`
- Directives: max turns cap, grep-before-read, parallel tool calls, no over-engineering, clean exit

**Expected impact:** Materially lower token burn per task without degrading output quality. Monitor over next few sessions and adjust turn limits if any agent hits the cap prematurely.', '2026-04-02T17:17:23.491195+00:00', '2026-04-02T17:17:23.491195+00:00');
INSERT INTO "issue_comments" ("id", "company_id", "issue_id", "author_agent_id", "author_user_id", "body", "created_at", "updated_at") VALUES ('03b52709-affb-434b-a2ed-aabbb838c9a4', 'aa76d3cd-4273-4443-83c8-70931173e770', '6e401772-ca5d-48e1-aaa2-f99d64fe0929', 'c4f12073-b2b2-4e0d-81dd-81d7fa182480', NULL, '## VIN-7: Inventory Module Review — Done

**Bugs found and fixed:**

1. **`getStockOverview` misclassification** (`service.ts`): `stock <= minStock` classified items with `minStock=0` as `low`. Fixed to `minStock > 0 && stock <= minStock` — consistent with `getLowStockAlerts` SQL which already had `AND min_stock > 0`.

2. **`createMovementSchema` validator** (`validators.ts`): `quantity: z.number().positive()` blocked ADJUSTMENT movements to 0 stock (valid when a shop physically runs out). Changed to `nonnegative()`.

3. **`routes.service.test.ts` suite crash**: Phase 8 stub referenced non-existent `modules/routes/service`. Added virtual mock + `describe.skip` so suite loads without breaking the runner.

**New tests added:** `inventory.service.test.ts` — 13 tests covering `getStockOverview` (classification logic, minStock=0 fix), `createMovement` (ENTRY/EXIT/ADJUSTMENT/errors), `listMovements` (pagination + type filters).

**Test suite: 23 suites passed, 263 tests passing, 0 failures.**', '2026-04-02T17:19:38.295005+00:00', '2026-04-02T17:19:38.295005+00:00');
INSERT INTO "issue_comments" ("id", "company_id", "issue_id", "author_agent_id", "author_user_id", "body", "created_at", "updated_at") VALUES ('cb336d28-e422-4f72-87cb-2d31733e387e', 'aa76d3cd-4273-4443-83c8-70931173e770', '60c3944e-1e9a-4e1b-b4d9-fc9ea95db4ac', 'c4f12073-b2b2-4e0d-81dd-81d7fa182480', NULL, '## VIN-9 Purchases — Done

purchases.service.test.ts — 6 tests: createPurchaseOrder, receivePurchaseOrder (full/partial), lot number generation, 404 errors

**Full test suite: 263 tests passing, 0 failures.**', '2026-04-02T17:23:36.595503+00:00', '2026-04-02T17:23:36.595503+00:00');
INSERT INTO "issue_comments" ("id", "company_id", "issue_id", "author_agent_id", "author_user_id", "body", "created_at", "updated_at") VALUES ('3c9fb7aa-7d92-4b42-aaa5-6d3da75431a4', 'aa76d3cd-4273-4443-83c8-70931173e770', 'ed3386ef-b558-4be6-beed-286038b33c39', 'c4f12073-b2b2-4e0d-81dd-81d7fa182480', NULL, '## VIN-10 POS/Sales — Done

sales.service.test.ts — 20 tests: createSale, confirmSale FIFO allocation, payments, multi-lot deduction, sale number generation

**Full test suite: 263 tests passing, 0 failures.**', '2026-04-02T17:23:36.641787+00:00', '2026-04-02T17:23:36.641787+00:00');
INSERT INTO "issue_comments" ("id", "company_id", "issue_id", "author_agent_id", "author_user_id", "body", "created_at", "updated_at") VALUES ('cfbe1c46-64e4-4a7f-96f8-acfa42067181', 'aa76d3cd-4273-4443-83c8-70931173e770', 'd56cc781-9803-4e09-9053-542794cabd30', 'c4f12073-b2b2-4e0d-81dd-81d7fa182480', NULL, '## VIN-11 Prices — Done

prices.service.test.ts — 10 tests: price lists, items, volume tiers (max 5 enforced), client resolution; service fix: max 5 tiers enforcement added

**Full test suite: 263 tests passing, 0 failures.**', '2026-04-02T17:23:36.681001+00:00', '2026-04-02T17:23:36.681001+00:00');
INSERT INTO "issue_comments" ("id", "company_id", "issue_id", "author_agent_id", "author_user_id", "body", "created_at", "updated_at") VALUES ('d27ba5fb-75f3-4269-bb19-49bda28d9c2a', 'aa76d3cd-4273-4443-83c8-70931173e770', 'fa0d6905-2713-4837-8eba-51685f0af09e', 'c4f12073-b2b2-4e0d-81dd-81d7fa182480', NULL, '## VIN-12 Recipes/Formula — Done

recipe.test.ts (20 tests BOM-01..07) + formula.test.ts (13 tests FORM-01..05) + bom.cte.test.ts (9 tests BOM-02..04); fixes: createRecipe duplicate check, parser.ts evaluate bug fixed

**Full test suite: 263 tests passing, 0 failures.**', '2026-04-02T17:23:36.719518+00:00', '2026-04-02T17:23:36.719518+00:00');
INSERT INTO "issue_comments" ("id", "company_id", "issue_id", "author_agent_id", "author_user_id", "body", "created_at", "updated_at") VALUES ('3783b70a-5c8b-4c93-bbef-00f50388a5d1', 'aa76d3cd-4273-4443-83c8-70931173e770', '57ee0940-1976-493d-bf68-285b55132c7c', 'c4f12073-b2b2-4e0d-81dd-81d7fa182480', NULL, '## Reports Module — Done

**Code review**: `getDashboardKPIs`, `getSalesReport`, `getTopProducts` — no bugs found.

**Tests added** (`reports.service.test.ts` — 7 tests, all passing):
- `getDashboardKPIs`: combined KPIs + null sum → 0
- `getSalesReport`: summary+byDate+byCategory aggregation, empty results, uncategorized → "Sin categoria"
- `getTopProducts`: sorted by quantity with details, empty when no sales

**Suite**: 304/304 tests passing.', '2026-04-02T17:29:00.070908+00:00', '2026-04-02T17:29:00.070908+00:00');
INSERT INTO "issue_comments" ("id", "company_id", "issue_id", "author_agent_id", "author_user_id", "body", "created_at", "updated_at") VALUES ('6ebc9cf6-cc27-4ce0-8e4e-faad871d39ae', 'aa76d3cd-4273-4443-83c8-70931173e770', 'ea2fea7d-ce58-4f94-8e7f-4e30f71fbf73', 'c4f12073-b2b2-4e0d-81dd-81d7fa182480', NULL, '## Settings/Roles/Organizations — Done

**Code review**: `roles/service.ts`, `organizations/service.ts` — no bugs found. All guards correct (isSystem → 403, in-use → 409, self-change → 403, self-deactivation → 403).

**Tests added** (`roles.service.test.ts` — 9 tests, all passing):
- `listRoles`: scoped by orgId
- `createRole`: always sets isSystem=false
- `updateRole`: non-system ✓, system role → 403, invalidates cache
- `deleteRole`: no members ✓, system role → 403, in-use → 409, not found → 404

**Suite**: 304/304 tests passing.', '2026-04-02T17:29:09.350489+00:00', '2026-04-02T17:29:09.350489+00:00');
INSERT INTO "issue_comments" ("id", "company_id", "issue_id", "author_agent_id", "author_user_id", "body", "created_at", "updated_at") VALUES ('63f81b99-4143-446f-9604-7b7336b64016', 'aa76d3cd-4273-4443-83c8-70931173e770', 'acd237ab-a848-4561-b0d4-1d8a325b6e2e', 'c4f12073-b2b2-4e0d-81dd-81d7fa182480', NULL, '## Notifications & Workflows — Done

**Code review**: `notifications/service.ts`, `workflows/service.ts` — no bugs found. Tenant isolation correct on markAsRead (orgId+userId compound check).

**Tests added**:

`notifications.service.test.ts` (8 tests):
- `list`: pagination meta, isRead filter, no filter when undefined
- `markAsRead`: marks read ✓, 404 when wrong user (tenant isolation), 404 when wrong org
- `markAllAsRead`: updates all unread, no-op when none
- `getUnreadCount`: returns count object

`workflows.service.test.ts` (11 tests):
- `getOrgWorkflow`: returns with steps, 404 wrong org
- `createStep`: creates ✓, 404 when workflow not found
- `updateStep`: updates ✓, 404 when step not in workflow
- `deleteStep`: deletes ✓, 400 when has orders, 404 when not found
- `createTransition`: creates ✓, 400 when step not in workflow, 404 when workflow missing
- `deleteTransition`: deletes ✓, 400 cross-workflow attempt, 404 not found

**Suite**: 304/304 tests passing, 1 skipped (routes Phase 8 stub).', '2026-04-02T17:29:20.10345+00:00', '2026-04-02T17:29:20.10345+00:00');
INSERT INTO "issue_comments" ("id", "company_id", "issue_id", "author_agent_id", "author_user_id", "body", "created_at", "updated_at") VALUES ('91fb376f-f183-4800-afeb-ca749dccfdb5', 'aa76d3cd-4273-4443-83c8-70931173e770', '31d8463d-5e6b-49ee-9789-711a37be75f0', NULL, '4232cc3dfbe2c47fccfc888c9754a879', '## Test confirmado ✓

- CEO agent operativo y respondiendo correctamente.
- Heartbeat procesado exitosamente.
- Sistema funcionando. 🎉', '2026-04-07T13:35:03.978962+00:00', '2026-04-07T13:35:03.978962+00:00');
INSERT INTO "issue_comments" ("id", "company_id", "issue_id", "author_agent_id", "author_user_id", "body", "created_at", "updated_at") VALUES ('0d6264eb-afbb-41c3-8087-82c5ed53c9d6', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', '4cee16e6-c661-4fee-b19f-659ffc602ca3', NULL, '4232cc3dfbe2c47fccfc888c9754a879', 'Run', '2026-04-07T21:29:55.02167+00:00', '2026-04-07T21:29:55.02167+00:00');
INSERT INTO "issue_comments" ("id", "company_id", "issue_id", "author_agent_id", "author_user_id", "body", "created_at", "updated_at") VALUES ('6c7bc95e-46d6-467f-997f-7ecaaaeef66d', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', '4cee16e6-c661-4fee-b19f-659ffc602ca3', NULL, '4232cc3dfbe2c47fccfc888c9754a879', '## Verificación completada ✓

El path configurado es correcto. El proyecto existe y está accesible.

- **Path:** `/Users/pacosemino/Desktop/Rosental/appminuta`
- **Repo:** `https://github.com/desarrollohitt-lab/appminuta2.0`
- **Contenido encontrado:** monorepo completo (`apps/`, `backend/`, `frontend/`, `packages/`, `supabase/`, `docker-compose*.yml`, etc.)

No se requiere ninguna acción — el path está bien configurado.
', '2026-04-07T21:32:50.418217+00:00', '2026-04-07T21:32:50.418217+00:00');
INSERT INTO "issue_comments" ("id", "company_id", "issue_id", "author_agent_id", "author_user_id", "body", "created_at", "updated_at") VALUES ('62745522-5724-4405-b2ed-30f9b6f3abd0', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', '970acb7b-a39d-4ed1-bfbc-2b3f2786c231', NULL, '4232cc3dfbe2c47fccfc888c9754a879', '## Implementado ✓

Todas las columnas del Mapa de Venta ahora son movibles mediante drag-and-drop, excepto **Acciones** que permanece fija al final.

**Cambios realizados:**
- `FIXED_START_KEYS = []` — ubicacion y piso ya no son fijas al inicio, se pueden arrastrar libremente
- `FIXED_END_KEYS = ["acciones"]` — solo Acciones queda fija al final
- `alwaysVisibleKeys` actualizado para que Estado y Plano sigan siendo siempre visibles (usando `ALWAYS_VISIBLE_KEYS`)

**Archivos modificados:**
- `MV/src/components/unit-table/types.ts`
- `MV/src/components/unit-table/index.tsx`

Commit: `53c3167` — La infraestructura de DnD (@dnd-kit) ya estaba en su lugar. El cambio fue mínimo y focalizado.', '2026-04-07T22:09:42.557289+00:00', '2026-04-07T22:09:42.557289+00:00');

-- Re-enable FK checks
SET session_replication_role = 'origin';
-- Audit log (test data)
INSERT INTO "activity_log" ("company_id", "actor_type", "actor_id", "action", "entity_type", "entity_id", "agent_id", "details", "created_at") VALUES
('beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'agent', 'a26366e5-a1ee-4d0a-a5d0-4f129f7705f7', 'issue.status_changed', 'issue', '628789d0-afb4-4c37-866c-bcd7308eaae8', 'a26366e5-a1ee-4d0a-a5d0-4f129f7705f7', '{"from": "todo", "to": "in_progress"}', NOW() - interval '6 hours'),
('beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'agent', 'a26366e5-a1ee-4d0a-a5d0-4f129f7705f7', 'issue.comment_added', 'issue', '628789d0-afb4-4c37-866c-bcd7308eaae8', 'a26366e5-a1ee-4d0a-a5d0-4f129f7705f7', '{"body": "Starting work on Excel export fix"}', NOW() - interval '5 hours 50 minutes'),
('beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'agent', '72ea4532-09e6-4fe8-90f1-c9569a2ad1e7', 'issue.created', 'issue', '706bbeec-b21d-4b31-9768-7e6c777b4692', '72ea4532-09e6-4fe8-90f1-c9569a2ad1e7', '{"title": "Semanal security review", "priority": "high"}', NOW() - interval '5 hours'),
('beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'agent', 'dd9adbad-d4df-4cef-b6a1-cd1412161421', 'agent.config_updated', 'agent', 'dd9adbad-d4df-4cef-b6a1-cd1412161421', 'dd9adbad-d4df-4cef-b6a1-cd1412161421', '{"changed": ["runtimeConfig.heartbeat.intervalSec"]}', NOW() - interval '4 hours 30 minutes'),
('beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'agent', 'a26366e5-a1ee-4d0a-a5d0-4f129f7705f7', 'issue.status_changed', 'issue', '628789d0-afb4-4c37-866c-bcd7308eaae8', 'a26366e5-a1ee-4d0a-a5d0-4f129f7705f7', '{"from": "in_progress", "to": "done"}', NOW() - interval '4 hours'),
('beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'user', 'KoTGhY32eLuGO61JdOQlz1WNpoIzwybv', 'issue.created', 'issue', '2b0f2f94-3659-44d5-9738-3f03134b1d4c', NULL, '{"title": "fix: horizontal scrollbar on bottom table", "priority": "medium"}', NOW() - interval '3 hours 45 minutes'),
('beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'user', 'KoTGhY32eLuGO61JdOQlz1WNpoIzwybv', 'issue.assigned', 'issue', '2b0f2f94-3659-44d5-9738-3f03134b1d4c', 'a26366e5-a1ee-4d0a-a5d0-4f129f7705f7', '{"assignee": "Backend Architect"}', NOW() - interval '3 hours 40 minutes'),
('beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'user', 'KoTGhY32eLuGO61JdOQlz1WNpoIzwybv', 'project.updated', 'project', 'bf8dadb4-f499-4cd2-aa30-ac61ef5bad89', NULL, '{"field": "status", "from": "backlog", "to": "in_progress"}', NOW() - interval '3 hours'),
('beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'user', 'KoTGhY32eLuGO61JdOQlz1WNpoIzwybv', 'agent.created', 'agent', '16a977ab-7557-4e0e-bd81-8791ba1eff1f', NULL, '{"name": "n8n Expert", "role": "engineer"}', NOW() - interval '2 hours 30 minutes'),
('beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'system', 'system', 'agent.heartbeat_completed', 'agent', '7ce4702a-373d-46d2-b2d7-b95f15d59ba9', '7ce4702a-373d-46d2-b2d7-b95f15d59ba9', '{"duration_ms": 45200, "exit_code": 0}', NOW() - interval '2 hours'),
('beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'system', 'system', 'budget.warning', 'company', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', NULL, '{"percent": 82, "spent": 41000, "limit": 50000}', NOW() - interval '1 hour 30 minutes'),
('beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'agent', '4fb22a8f-dcef-4664-939d-4add7e139a3a', 'issue.status_changed', 'issue', '970acb7b-a39d-4ed1-bfbc-2b3f2786c231', '4fb22a8f-dcef-4664-939d-4add7e139a3a', '{"from": "backlog", "to": "todo"}', NOW() - interval '1 hour'),
('beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'agent', '16a977ab-7557-4e0e-bd81-8791ba1eff1f', 'issue.comment_added', 'issue', '4006602d-bb58-4234-b849-53068f93d29e', '16a977ab-7557-4e0e-bd81-8791ba1eff1f', '{"body": "Reordering logic updated for manzana+unidad sorting"}', NOW() - interval '45 minutes'),
('beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'user', 'KoTGhY32eLuGO61JdOQlz1WNpoIzwybv', 'issue.status_changed', 'issue', 'b1bb06ef-2304-4c80-a15c-a31c15b9eb81', NULL, '{"from": "todo", "to": "in_progress"}', NOW() - interval '30 minutes'),
('beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'system', 'system', 'agent.wakeup', 'agent', 'a26366e5-a1ee-4d0a-a5d0-4f129f7705f7', 'a26366e5-a1ee-4d0a-a5d0-4f129f7705f7', '{"source": "on_demand", "reason": "New issue assigned"}', NOW() - interval '15 minutes'),
('beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'agent', 'a26366e5-a1ee-4d0a-a5d0-4f129f7705f7', 'issue.status_changed', 'issue', '970acb7b-a39d-4ed1-bfbc-2b3f2786c231', 'a26366e5-a1ee-4d0a-a5d0-4f129f7705f7', '{"from": "todo", "to": "in_progress"}', NOW() - interval '10 minutes');
