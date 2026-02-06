"use client";

import { SettingsProvider } from "@/lib/settings";

export default function Providers({ children }) {
  return <SettingsProvider>{children}</SettingsProvider>;
}
