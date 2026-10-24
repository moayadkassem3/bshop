// Lets the app's screen appear over the lock screen and wake the display when a
// full-screen alert opens it. Test build only: production uses a dedicated alert screen.
const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

module.exports = function withLockScreenActivity(config) {
  return withAndroidManifest(config, (cfg) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(cfg.modResults);
    activity.$['android:showWhenLocked'] = 'true';
    activity.$['android:turnScreenOn'] = 'true';
    return cfg;
  });
};
