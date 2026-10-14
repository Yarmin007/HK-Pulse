export type AppModule =
  | "allocation"        // /allocation
  | "tasks"             // /my-tasks & /tasks
  | "minibar"           // /minibar
  | "water"             // /water
  | "laundry"           // /laundry
  | "inventory"         // /inventory
  | "attendance"        // /attendance
  | "schedule"          // /schedule
  | "ac-tracker"        // /ac-tracker
  | "leave-requests"    // /leave-requests
  | "settings";         // /settings

export interface HostSession {
  id: string;
  host_id?: string;
  full_name: string;
  role: string;
  system_role: string;
  is_super_admin?: boolean;
  allowed_modules?: string[];
  jetty_allocation?: string;
  impersonating_from?: {
    id: string;
    full_name: string;
    system_role: string;
  };
}

// Check if user has permission to see a page/feature
export function hasModuleAccess(session: HostSession | null, moduleKey: AppModule): boolean {
  if (!session) return false;

  // Real Super Admin sees EVERYTHING
  if (session.is_super_admin && !session.impersonating_from) {
    return true;
  }

  // Allocation and Tasks are universal for all staff
  if (moduleKey === "allocation" || moduleKey === "tasks") {
    return true;
  }

  // Only real admin can see system settings
  if (moduleKey === "settings") {
    return session.system_role === "admin" || !!session.is_super_admin;
  }

  // Check the individual host's allowed_modules list
  const userModules = session.allowed_modules || [];
  return userModules.includes(moduleKey);
}

// Switch into another user's shoes
export function impersonateHost(currentAdmin: HostSession, targetHost: any) {
  const simulated: HostSession = {
    id: targetHost.id,
    host_id: targetHost.host_id,
    full_name: targetHost.full_name,
    role: targetHost.role,
    system_role: targetHost.system_role || "staff",
    is_super_admin: false,
    allowed_modules: targetHost.allowed_modules || ["allocation", "tasks"],
    jetty_allocation: targetHost.jetty_allocation,
    impersonating_from: {
      id: currentAdmin.impersonating_from?.id || currentAdmin.id,
      full_name: currentAdmin.impersonating_from?.full_name || currentAdmin.full_name,
      system_role: "admin",
    },
  };

  localStorage.setItem("hk_pulse_session", JSON.stringify(simulated));
  window.location.reload();
}

// Exit simulation and return back to your Super Admin
export function exitImpersonation() {
  const raw = localStorage.getItem("hk_pulse_session");
  if (!raw) return;

  const current: HostSession = JSON.parse(raw);
  if (current.impersonating_from) {
    const restored: HostSession = {
      id: current.impersonating_from.id,
      full_name: current.impersonating_from.full_name,
      role: "Coordinator",
      system_role: "admin",
      is_super_admin: true,
      allowed_modules: [
        "allocation",
        "tasks",
        "minibar",
        "water",
        "laundry",
        "inventory",
        "attendance",
        "schedule",
        "ac-tracker",
        "leave-requests",
        "settings",
      ],
    };
    localStorage.setItem("hk_pulse_session", JSON.stringify(restored));
    window.location.reload();
  }
}