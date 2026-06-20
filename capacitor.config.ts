import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.bolitas.app",
  appName: "Bolitas",
  webDir: "dist",
  backgroundColor: "#121212",
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_icon",
      iconColor: "#FFC400",
    },
  },
};

export default config;
