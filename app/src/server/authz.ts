import type { Actor } from './actor'
import { forbidden, unauthorized } from './errors'

export function assertBoard(actor: Actor): asserts actor is Extract<Actor, { type: 'board' }> {
  if (actor.type !== 'board') throw forbidden('Board access required')
}

export function assertInstanceAdmin(actor: Actor): asserts actor is Extract<Actor, { type: 'board' }> {
  assertBoard(actor)
  if (!actor.isInstanceAdmin && actor.source !== 'local_implicit') {
    throw forbidden('Instance admin access required')
  }
}

export function assertCompanyAccess(actor: Actor, companyId: string) {
  if (actor.type === 'none') throw unauthorized()
  if (actor.type === 'agent' && actor.companyId !== companyId) {
    throw forbidden('Agent key cannot access another company')
  }
  if (actor.type === 'board' && actor.source !== 'local_implicit' && !actor.isInstanceAdmin) {
    const allowed = actor.companyIds ?? []
    if (!allowed.includes(companyId)) throw forbidden('User does not have access to this company')
  }
}

export function getActorInfo(actor: Actor) {
  if (actor.type === 'none') throw unauthorized()
  if (actor.type === 'agent') {
    return {
      actorType: 'agent' as const,
      actorId: actor.agentId,
      agentId: actor.agentId,
      runId: actor.runId ?? null,
    }
  }
  return {
    actorType: 'user' as const,
    actorId: actor.userId,
    agentId: null,
    runId: actor.runId ?? null,
  }
}
