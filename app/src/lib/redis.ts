import { createClient } from 'redis'

let _redis: ReturnType<typeof createClient> | null = null

export async function getRedis() {
  if (!_redis) {
    _redis = createClient({ url: process.env.REDIS_URL })
    _redis.on('error', (err) => console.error('[redis]', err))
    await _redis.connect()
  }
  return _redis
}
