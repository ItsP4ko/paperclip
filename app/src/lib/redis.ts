import { createClient } from 'redis'

let _redis: ReturnType<typeof createClient> | null = null
let _connecting: Promise<ReturnType<typeof createClient>> | null = null

export async function getRedis() {
  if (_redis) return _redis
  if (!_connecting) {
    _connecting = (async () => {
      const client = createClient({ url: process.env.REDIS_URL })
      client.on('error', (err) => {
        console.error('[redis]', err)
        _redis = null
        _connecting = null
      })
      await client.connect()
      _redis = client
      _connecting = null
      return client
    })()
  }
  return _connecting
}
