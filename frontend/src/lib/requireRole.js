import { getUser } from "./auth";

export function requireRole(roles, redirect = "/login") {
  const user = getUser();

  if (!user || !roles.includes(user.role)) {
    window.location.href = redirect;
    return false;
  }

  return true;
}
