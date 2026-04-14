/** @type {import('next').NextConfig} */
const config = {
  // Tell Vercel's file-tracing to bundle the CSV alongside the API route
  outputFileTracingIncludes: {
    "/api/data": ["./data/**/*"],
  },
};

export default config;
