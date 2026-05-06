/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: '/opt-timeline',
  env: {
    NEXT_PUBLIC_BASE_PATH: '/opt-timeline',
  },
  outputFileTracingIncludes: {
    '/api/data': ['./data/**/*'],
  },
}

export default nextConfig
