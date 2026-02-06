import { BACKEND_URL } from "@/lib/api";

export function resolveMediaUrl(url) {
  if (!url) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/uploads/")) return `${BACKEND_URL}${url}`;
  return url;
}
