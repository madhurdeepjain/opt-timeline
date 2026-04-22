/** @type {import('next').NextConfig} */
const config = {
  basePath: "/opt-timeline",
  env: {
    NEXT_PUBLIC_BASE_PATH: "/opt-timeline",
  },
  // Tell Vercel's file-tracing to bundle the CSV alongside the API route
  outputFileTracingIncludes: {
    "/api/data": ["./data/**/*"],
  },
};

export default config;
