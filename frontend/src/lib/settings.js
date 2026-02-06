"use client";

import { createContext, useContext, useEffect, useState } from "react";
import api from "@/lib/api";

const SettingsContext = createContext({ settings: null, refresh: () => {} });

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(null);

  async function load() {
    try {
      const res = await api.get("/settings");
      setSettings(res.data);
      if (typeof document !== "undefined") {
        const root = document.documentElement;
        root.style.setProperty("--brand", res.data.brandColor || "#e11d48");
        root.style.setProperty("--accent", res.data.accentColor || "#f43f5e");
        root.style.setProperty("--bg", res.data.backgroundColor || "#000000");
        root.style.setProperty("--card", res.data.cardColor || "#0b0b0b");
      }
    } catch {}
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, refresh: load }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
