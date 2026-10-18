import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@job-checker/audit",
    "@job-checker/benchmarks",
    "@job-checker/contracts",
    "@job-checker/db",
    "@job-checker/documents",
    "@job-checker/explanations",
    "@job-checker/extraction",
    "@job-checker/identity",
    "@job-checker/observability",
    "@job-checker/reports",
    "@job-checker/rules"
  ],
  serverExternalPackages: ["pg", "unpdf", "pdf-lib", "@aws-sdk/client-s3"],
  poweredByHeader: false,
  reactStrictMode: true
};

export default nextConfig;
