import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '@paperclipai/db'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL environment variable is required')
const client = postgres(url, {
  max: 1,
  idle_timeout: 20,
  connect_timeout: 10,
})

export const db = drizzle(client, { schema })
export type Db = typeof db
