import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '@paperclipai/db'

type Db = ReturnType<typeof drizzle<typeof schema>>

let _db: Db | undefined

function getDb(): Db {
  if (!_db) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL environment variable is required')
    const client = postgres(url, { max: 1, idle_timeout: 20, connect_timeout: 10 })
    _db = drizzle(client, { schema })
  }
  return _db
}

export const db: Db = new Proxy({} as Db, {
  get(_, prop) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (getDb() as any)[prop as string]
  },
})

export type { Db }
