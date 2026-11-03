const baseConfig = require("./app.json");

const androidMapsApiKey = process.env.ANDROID_GOOGLE_MAPS_API_KEY || "";

module.exports = {
  ...baseConfig,
  expo: {
    ...baseConfig.expo,
    plugins: [
      ...(baseConfig.expo.plugins || []),
      ...(androidMapsApiKey
        ? [["react-native-maps", { androidGoogleMapsApiKey: androidMapsApiKey }]]
        : []),
    ],
    extra: {
      ...(baseConfig.expo.extra || {}),
      mapsConfigured: Boolean(androidMapsApiKey),
    },
  },
};
