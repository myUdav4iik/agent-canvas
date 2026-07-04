import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@agent-company/shared", "@agent-company/engine"],
  serverExternalPackages: ["@prisma/client"],
  turbopack: {
    root: "../../",
  },
};

export default config;
