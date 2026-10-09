/**
 * Signs release builds with Agent X's own key instead of React Native's public debug key.
 * The key comes from environment variables (set by the GitHub Action from repository secrets):
 *   AGENTX_KEYSTORE_FILE, AGENTX_KEYSTORE_PASSWORD, AGENTX_KEY_ALIAS, AGENTX_KEY_PASSWORD
 * Without them the build falls back to the debug key, so local builds keep working.
 */
const { withAppBuildGradle } = require("expo/config-plugins");

const MARKER = "// agentx-release-signing";

const SNIPPET = `
${MARKER}
if (System.getenv("AGENTX_KEYSTORE_FILE")) {
    android.signingConfigs {
        agentxRelease {
            storeFile file(System.getenv("AGENTX_KEYSTORE_FILE"))
            storePassword System.getenv("AGENTX_KEYSTORE_PASSWORD")
            keyAlias System.getenv("AGENTX_KEY_ALIAS")
            keyPassword System.getenv("AGENTX_KEY_PASSWORD")
        }
    }
    android.buildTypes.release.signingConfig = android.signingConfigs.agentxRelease
}
`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(MARKER)) cfg.modResults.contents += SNIPPET;
    return cfg;
  });
};
