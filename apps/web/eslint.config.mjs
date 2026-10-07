import nextConfig from "@tripforge/eslint-config/nextjs";

const config = [...nextConfig, { ignores: ["public/maplibre/**"] }];

export default config;
