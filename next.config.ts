import type { NextConfig } from 'next'

const config: NextConfig = {
  // Allow cross-origin requests from the WS server during dev
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [{ key: 'Access-Control-Allow-Origin', value: '*' }],
      },
    ]
  },
}

export default config
