import { NextRequest, NextResponse } from 'next/server'
import { count, and, eq, gt, inArray, isNull, sql } from 'drizzle-orm'
import { heartbeatRuns, instanceUserRoles, invites } from '@paperclipai/db'
import { db } from '@/lib/db'
import { handleError } from '@/server/errors'
import { instanceSettingsService } from '@/services/instance-settings'
import { readPersistedDevServerStatus, toDevServerHealthStatus } from '@/server/dev-server-status'

export const maxDuration = 10

const appVersion = process.env.npm_package_version ?? '1.0.0'

export async function GET(_req: NextRequest) {
  try {
    const deploymentMode = (process.env.PAPERCLIP_DEPLOYMENT_MODE ?? 'local_trusted') as
      | 'local_trusted'
      | 'authenticated'
    const deploymentExposure = (process.env.PAPERCLIP_DEPLOYMENT_EXPOSURE ?? 'private') as
      | 'private'
      | 'public'
    const companyDeletionEnabled = process.env.PAPERCLIP_COMPANY_DELETION_ENABLED !== 'false'

    try {
      await db.execute(sql`SELECT 1`)
    } catch {
      return NextResponse.json(
        { status: 'unhealthy', version: appVersion, error: 'database_unreachable' },
        { status: 503 },
      )
    }

    let bootstrapStatus: 'ready' | 'bootstrap_pending' = 'ready'
    let bootstrapInviteActive = false

    if (deploymentMode === 'authenticated') {
      const roleCount = await db
        .select({ count: count() })
        .from(instanceUserRoles)
        .where(sql`${instanceUserRoles.role} = 'instance_admin'`)
        .then((rows) => Number(rows[0]?.count ?? 0))

      bootstrapStatus = roleCount > 0 ? 'ready' : 'bootstrap_pending'

      if (bootstrapStatus === 'bootstrap_pending') {
        const now = new Date()
        const inviteCount = await db
          .select({ count: count() })
          .from(invites)
          .where(
            and(
              eq(invites.inviteType, 'bootstrap_ceo'),
              isNull(invites.revokedAt),
              isNull(invites.acceptedAt),
              gt(invites.expiresAt, now),
            ),
          )
          .then((rows) => Number(rows[0]?.count ?? 0))

        bootstrapInviteActive = inviteCount > 0
      }
    }

    const persistedDevServerStatus = readPersistedDevServerStatus()
    let devServer: ReturnType<typeof toDevServerHealthStatus> | undefined

    if (persistedDevServerStatus) {
      const instanceSettings = instanceSettingsService(db)
      const experimentalSettings = await instanceSettings.getExperimental()
      const activeRunCount = await db
        .select({ count: count() })
        .from(heartbeatRuns)
        .where(inArray(heartbeatRuns.status, ['queued', 'running']))
        .then((rows) => Number(rows[0]?.count ?? 0))

      devServer = toDevServerHealthStatus(persistedDevServerStatus, {
        autoRestartEnabled: experimentalSettings.autoRestartDevServerWhenIdle ?? false,
        activeRunCount,
      })
    }

    return NextResponse.json({
      status: 'ok',
      version: appVersion,
      deploymentMode,
      deploymentExposure,
      authReady: true,
      bootstrapStatus,
      bootstrapInviteActive,
      features: { companyDeletionEnabled },
      ...(devServer ? { devServer } : {}),
    })
  } catch (err) {
    return handleError(err)
  }
}
