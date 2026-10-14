export type AppModule = 
  | "allocation"
  | "minibar"
  | "water_production"
  | "roster"
  | "off_days"
  | "admin_settings";

export interface UserSession {
  id: string;
  name: string;
  email: string;
  system_role: "attendant" | "coordinator" | "supervisor" | "admin" | "super_admin";
  is_super_admin: boolean;
  allowed_modules: AppModule[];
  allocated_villas?: string[];
  // Present only when impersonating
  impersonating_from?: {
    id: string;
    name: string;
  };
}

// Check if current user can access a menu route
export function canAccessModule(session: UserSession | null, moduleKey: AppModule): boolean {
  if (!session) return false;
  // Super admin always has access unless explicitly impersonating
  if (session.is_super_admin && !session.impersonating_from) return true;
  
  // Default shared module for all resort staff
  if (moduleKey === "allocation") return true;

  // Check explicit list assigned to this staff member
  return (session.allowed_modules || []).includes(moduleKey);
}

// Start impersonation ("View As")
export function impersonateUser(realSuperAdmin: UserSession, targetUser: any) {
  const simulatedSession: UserSession = {
    id: targetUser.id,
    name: targetUser.name,
    email: targetUser.email,
    system_role: targetUser.system_role,
    is_super_admin: false, // temporarily stripped so you experience their exact limitations
    allowed_modules: targetUser.allowed_modules || ["allocation"],
    allocated_villas: targetUser.allocated_villas || [],
    impersonating_from: {
      id: realSuperAdmin.id,
      name: realSuperAdmin.name,
    },
  };

  localStorage.setItem("hk_pulse_session", JSON.stringify(simulatedSession));
  window.location.reload();
}

// Exit impersonation and return back to Super Admin
export function stopImpersonation() {
  const sessionStr = localStorage.getItem("hk_pulse_session");
  if (!sessionStr) return;

  const current = JSON.parse(sessionStr);
  if (current.impersonating_from) {
    // Restore original super admin profile from Supabase or cached backup
    const restoredSession: Partial<UserSession> = {
      id: current.impersonating_from.id,
      name: current.impersonating_from.name,
      is_super_admin: true,
      system_role: "super_admin",
    };
    localStorage.setItem("hk_pulse_session", JSON.stringify(restoredSession));
    window.location.reload();
  }
}