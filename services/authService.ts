
import { supabase } from './supabase';

export const authService = {
    async signIn(email: string, password: string) {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });
        return { data, error };
    },

    async signOut() {
        const { error } = await supabase.auth.signOut();
        return { error };
    },

    async getCurrentUser() {
        const { data: { user } } = await supabase.auth.getUser();
        return user;
    },

    onAuthStateChange(callback: (event: any, session: any) => void) {
        return supabase.auth.onAuthStateChange(callback);
    },

    isAdmin(user: any) {
        if (!user) return false;
        const email = user.email?.toLowerCase() || '';
        const role = user.role?.toLowerCase() || user.user_metadata?.role?.toLowerCase() || '';
        return email.includes('admin') || email.includes('gustavo') || email.includes('daniel') || role === 'admin';
    }
};
