// "Full control" = an admin login (Settings → Logins & access → admin), the super admin, or the admin
// password login. While "viewing as" another host you get that host's access, like the rest of the app.
export const hasFullControl = (): boolean => {
    if (typeof window === 'undefined') return false;
    try {
        const raw = localStorage.getItem('hk_pulse_session');
        if (raw) {
            const s = JSON.parse(raw);
            if (s?.impersonating_from) return false;
            if (s?.system_role === 'admin' || s?.is_super_admin === true) return true;
        }
        return localStorage.getItem('hk_pulse_admin_auth') === 'true';
    } catch {
        return false;
    }
};
