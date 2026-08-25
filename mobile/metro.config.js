const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// expo-sqlite web support (https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/#web-setup):
// Metro must treat .wasm as an asset so expo-sqlite's wa-sqlite.wasm resolves,
// and the dev server must send COOP/COEP headers to enable SharedArrayBuffer.
config.resolver.assetExts.push("wasm");

config.server.enhanceMiddleware = (middleware) => {
  return (req, res, next) => {
    res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    middleware(req, res, next);
  };
};

module.exports = config;
