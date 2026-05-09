/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: '/opt-timeline',
  env: {
    NEXT_PUBLIC_BASE_PATH: '/opt-timeline',
  },
  outputFileTracingIncludes: {
    '/api/data': ['./data/**/*'],
    '/api/meta': ['./data/meta.json'],
  },
}

export default nextConfig
