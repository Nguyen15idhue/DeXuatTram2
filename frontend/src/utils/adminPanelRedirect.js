import { canAccessCustomers } from "./leadAccess";

export const getAdminPanelRedirect = (user) => {
  if (["SUPER_ADMIN", "ADMIN", "SALES", "CTV", "NPP"].includes(user?.role)) {
    return "/admin/proposals";
  }
  if (user?.role === "MKT" && canAccessCustomers(user)) return "/admin/leads";
  return "/map";
};
