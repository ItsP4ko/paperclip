-- =============================================================
-- Paperclip DEV Seeder — datos reales de Supabase (production)
-- Ejecutar contra: postgres://paperclip:paperclip@localhost:5432/paperclip
-- =============================================================

-- ---------------------------------------------------------------
-- 1. USERS (better-auth)
-- ---------------------------------------------------------------
INSERT INTO "user" (id, name, email, email_verified, image, created_at, updated_at) VALUES
  ('4232cc3dfbe2c47fccfc888c9754a879', 'Paco Semino',  'paco.semino@gmail.com',        true,  NULL, '2026-04-04 23:49:38.11474+00', '2026-04-04 23:49:38.11474+00'),
  ('rdMTa7gH3Y92loVIxgW5qvUEqcZH69tJ', 'Valentino',   'valentino.riva@rosental.com',  false, NULL, '2026-04-06 12:16:53.254+00',   '2026-04-06 12:16:53.254+00'),
  ('UK2Hkjk8u7NNOmZzO7KtfxRbRZSRNCEj', 'Sara',        'sara.montanari@rosental.com',  false, NULL, '2026-04-06 15:36:43.964+00',   '2026-04-06 15:36:43.964+00'),
  ('tGaJ6fCJC6fOScn5yPz32qvB9QO1GBus', 'paco test',   'paco.semino1@gmail.com',       false, NULL, '2026-04-06 19:35:38.474+00',   '2026-04-06 19:35:38.474+00'),
  ('nfTjcoUrX5AX1wlujz4GUS7dpwBnyppq', 'Mateo',       'mateo.scarabino@rosental.com', false, NULL, '2026-04-07 14:41:54.459+00',   '2026-04-07 14:41:54.459+00')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------
-- 2. ACCOUNTS (credentials con password hashes reales)
-- ---------------------------------------------------------------
INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES
  ('f5fc75fb5da4461c9821be07348edcfb', '4232cc3dfbe2c47fccfc888c9754a879', 'credential', '4232cc3dfbe2c47fccfc888c9754a879',
   '38ce71a0369b225cd219a2ea951ca011:1570634418e787410a037e48c67c6c853d33d438bc83b2a3845df64e95245beade265667cda2446f95c8bdb1d0c19ba67f531b879fe1929173e85b4ad8bd2571',
   NOW(), NOW()),
  ('aEMnACDzdRvP9220jWhwWyLC2dyDpMI5', 'rdMTa7gH3Y92loVIxgW5qvUEqcZH69tJ', 'credential', 'rdMTa7gH3Y92loVIxgW5qvUEqcZH69tJ',
   '1beb5d4c9c2c8592dd37074ebfb62775:944d463b4e7c1991f8e58ec28d7c667acf88196a1d73437b9361c896fb890b0a783402d6c3ffdad9fb3878833acc8bc58fd5edfb9cdb7282f98d6dab1d1eb55a',
   NOW(), NOW()),
  ('uVXgjrFHsh4ZXAKRoq3PX0r5gkMIF8dF', 'UK2Hkjk8u7NNOmZzO7KtfxRbRZSRNCEj', 'credential', 'UK2Hkjk8u7NNOmZzO7KtfxRbRZSRNCEj',
   'd6626da97e2cda54c584b2378a7d341b:d2b663dd5a3f9d2af7a0ab86b804961a92172ea5838d8a1595f60a5fc57e27b9099e73392e4b07b64e8b59a7a1711745168678c38ebf35e3823951420e6cc3ef',
   NOW(), NOW()),
  ('9UEB1hWjsLAF7swaK6GROfq1O5PFF8wR', 'tGaJ6fCJC6fOScn5yPz32qvB9QO1GBus', 'credential', 'tGaJ6fCJC6fOScn5yPz32qvB9QO1GBus',
   'a66eb6c483a5c8eac011318a5069ab2a:e575d4276dfdf09a6f4c9883f322d9da88f4ce53064d623efc6c3ec15bc52c77248d5bdd024268ecdd9d271024b0c7db2a87b9e94a412c7011ea99176f0f77eb',
   NOW(), NOW()),
  ('VzvjtAme4LdXcb5tMa4ymwUhOsjLO0PM', 'nfTjcoUrX5AX1wlujz4GUS7dpwBnyppq', 'credential', 'nfTjcoUrX5AX1wlujz4GUS7dpwBnyppq',
   'a85a18fb02b0b23cd2db1a64477d113d:df29d28f10962ea331ed1f0d8dce523e66bddc1d4aef2d9d3f7dc9340fdaa10ee098f51b95a8e2cee855ca53983261b2453865842a1dc3c383138c913b6955ce',
   NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------
-- 3. INSTANCE ADMIN
-- ---------------------------------------------------------------
INSERT INTO instance_user_roles (id, user_id, role, created_at, updated_at) VALUES
  ('9fa99257-650e-4505-8a60-29e8c5f96901', '4232cc3dfbe2c47fccfc888c9754a879', 'instance_admin', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------
-- 4. COMPANIES
-- ---------------------------------------------------------------
INSERT INTO companies (id, name, issue_prefix, status, budget_monthly_cents, spent_monthly_cents, require_board_approval_for_new_agents, created_at, updated_at) VALUES
  ('85b9dfd2-6c89-4676-8358-3cb2b6495f86', 'n8n',      'N8N', 'active', 0, 0, true, NOW(), NOW()),
  ('beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'Rosental', 'ROS', 'active', 0, 0, true, NOW(), NOW()),
  ('aa76d3cd-4273-4443-83c8-70931173e770', 'vinoteca', 'VIN', 'active', 0, 0, true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------
-- 5. COMPANY MEMBERSHIPS
-- ---------------------------------------------------------------
INSERT INTO company_memberships (id, company_id, principal_type, principal_id, membership_role, status, created_at, updated_at) VALUES
  (gen_random_uuid(), '85b9dfd2-6c89-4676-8358-3cb2b6495f86', 'user', '4232cc3dfbe2c47fccfc888c9754a879', 'owner',     'active', NOW(), NOW()),
  (gen_random_uuid(), 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'user', '4232cc3dfbe2c47fccfc888c9754a879', 'owner',     'active', NOW(), NOW()),
  (gen_random_uuid(), 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'user', 'rdMTa7gH3Y92loVIxgW5qvUEqcZH69tJ', 'member',    'active', NOW(), NOW()),
  (gen_random_uuid(), 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'user', 'UK2Hkjk8u7NNOmZzO7KtfxRbRZSRNCEj', 'member',    'active', NOW(), NOW()),
  (gen_random_uuid(), 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'user', 'nfTjcoUrX5AX1wlujz4GUS7dpwBnyppq', 'developer', 'active', NOW(), NOW()),
  (gen_random_uuid(), 'aa76d3cd-4273-4443-83c8-70931173e770', 'user', '4232cc3dfbe2c47fccfc888c9754a879', 'owner',     'active', NOW(), NOW()),
  (gen_random_uuid(), 'aa76d3cd-4273-4443-83c8-70931173e770', 'user', 'tGaJ6fCJC6fOScn5yPz32qvB9QO1GBus', 'developer', 'active', NOW(), NOW())
ON CONFLICT (company_id, principal_type, principal_id) DO NOTHING;

-- ---------------------------------------------------------------
-- 6. PROJECTS
-- ---------------------------------------------------------------
INSERT INTO projects (id, name, company_id, status, created_at, updated_at) VALUES
  ('7cb3eee5-3439-493f-b777-155a75c5e55e', 'Onboarding',       '85b9dfd2-6c89-4676-8358-3cb2b6495f86', 'in_progress', NOW(), NOW()),
  ('3d0a31ad-0e0a-4165-8ea0-5809c2eb0b50', 'Automatizaciones', '85b9dfd2-6c89-4676-8358-3cb2b6495f86', 'in_progress', NOW(), NOW()),
  ('799311f2-18b2-49f6-9268-b192350d1291', 'Onboarding',       'aa76d3cd-4273-4443-83c8-70931173e770', 'in_progress', NOW(), NOW()),
  ('bf8dadb4-f499-4cd2-aa30-ac61ef5bad89', 'Onboarding',       'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'in_progress', NOW(), NOW()),
  ('0b4583ca-b268-4d77-8a36-32f3b8de504b', 'Hitt Estate',      'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'planned',     NOW(), NOW()),
  ('c574ac5d-ee99-49a5-a02a-298f74eb1dce', 'Paco',             'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'planned',     NOW(), NOW()),
  ('c9b531a8-d1b9-413a-9ac7-7914fd20be06', 'Hitt Buyer',       'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', 'planned',     NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------
-- 7. ISSUES (Rosental / Hitt Estate — datos reales)
-- ---------------------------------------------------------------
INSERT INTO issues (id, title, status, priority, company_id, project_id, created_at, updated_at) VALUES
  ('706bbeec-b21d-4b31-9768-7e6c777b4692', 'Semanal security review',                                                                           'todo',        'medium',   'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', '0b4583ca-b268-4d77-8a36-32f3b8de504b', NOW(), NOW()),
  ('b1bb06ef-2304-4c80-a15c-a31c15b9eb81', '5 agents stuck in error state — needs board review',                                                'todo',        'high',     'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', NULL,                                   NOW(), NOW()),
  ('2b0f2f94-3659-44d5-9738-3f03134b1d4c', 'fix: horizontal scrollbar on bottom table',                                                         'in_review',   'high',     'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', '0b4583ca-b268-4d77-8a36-32f3b8de504b', NOW(), NOW()),
  ('970acb7b-a39d-4ed1-bfbc-2b3f2786c231', 'feat: columna movibles',                                                                            'done',        'low',      'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', '0b4583ca-b268-4d77-8a36-32f3b8de504b', NOW(), NOW()),
  ('4006602d-bb58-4234-b849-53068f93d29e', 'fix: lotes deben ordenarse primero por manzana y luego por unidad',                                  'done',        'medium',   'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', '0b4583ca-b268-4d77-8a36-32f3b8de504b', NOW(), NOW()),
  ('9bf24ba9-bed8-4c34-95e7-adf069a6fb92', 'fix: campo lote comercial; unidad funcional',                                                        'todo',        'high',     'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', '0b4583ca-b268-4d77-8a36-32f3b8de504b', NOW(), NOW()),
  ('628789d0-afb4-4c37-866c-bcd7308eaae8', 'fix: exportar Excel',                                                                               'in_progress', 'medium',   'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', '0b4583ca-b268-4d77-8a36-32f3b8de504b', NOW(), NOW()),
  ('19be0672-74a2-46a2-8249-6ce4ba59478f', 'feat: notificar a firmante/admin al cambiar estado de unidad con selección de motivo obligatoria',   'in_review',   'high',     'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', '0b4583ca-b268-4d77-8a36-32f3b8de504b', NOW(), NOW()),
  ('4633c560-25cb-4436-8477-3a596f85b3a1', 'feat: subir planos desde el mapa de ventas en la app',                                              'backlog',     'low',      'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', '0b4583ca-b268-4d77-8a36-32f3b8de504b', NOW(), NOW()),
  ('5160bd4f-4d50-4805-a8eb-aed32533eaf1', 'fix(migracion): Fla V tiologia (D, S)',                                                             'done',        'low',      'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', '0b4583ca-b268-4d77-8a36-32f3b8de504b', NOW(), NOW()),
  ('a61a4f3d-cd00-4c3d-9289-ce6d75408758', 'feat: subir proyectos Nativo (Rosental y Rossetti)',                                                 'todo',        'low',      'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', '0b4583ca-b268-4d77-8a36-32f3b8de504b', NOW(), NOW()),
  ('8902fe39-f398-47ad-9520-8d955b923569', 'fix: rol firmante — puede ver todas las minutas pero solo firmar las aprobadas',                     'done',        'critical', 'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', '0b4583ca-b268-4d77-8a36-32f3b8de504b', NOW(), NOW()),
  ('d9523100-3aff-4c0e-bd26-90d23f4d7417', 'feat: selector de precio al crear minuta (existen múltiples campos de precio)',                      'backlog',     'low',      'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', '0b4583ca-b268-4d77-8a36-32f3b8de504b', NOW(), NOW()),
  ('24d86ca5-f296-4462-b188-8b29289e0f5e', 'fix: regla de negocio — bloquear precio negociado mayor al precio de lista al crear minuta',         'done',        'medium',   'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', '0b4583ca-b268-4d77-8a36-32f3b8de504b', NOW(), NOW()),
  ('4cee16e6-c661-4fee-b19f-659ffc602ca3', 'Check: path proyecto local correcto',                                                                'done',        'low',      'beed4cda-89ad-4c05-9be5-ffef6db7b3b5', '0b4583ca-b268-4d77-8a36-32f3b8de504b', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
