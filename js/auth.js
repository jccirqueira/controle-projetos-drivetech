import { supabase } from './supabaseClient.js';

export const auth = {
    // Login with Email and Password
    async login(email, password) {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });
        return { data, error };
    },

    // Sign Out
    async logout() {
        const { error } = await supabase.auth.signOut();
        if (!error) {
            const isInsidePages = window.location.pathname.includes('/pages/');
            window.location.href = isInsidePages ? 'login.html' : 'pages/login.html';
        }
        return { error };
    },

    // Get Current Session
    async getSession() {
        const { data: { session }, error } = await supabase.auth.getSession();
        return { session, error };
    },

    // Get Current User
    async getUser() {
        const { data: { user }, error } = await supabase.auth.getUser();
        return { user, error };
    },

    // Check Auth and Redirect
    async checkAuth() {
        const { session } = await this.getSession();
        const pathname = window.location.pathname;
        const isLoginPage = pathname.endsWith('login.html');
        const isInsidePages = pathname.includes('/pages/');

        if (!session) {
            if (!isLoginPage) {
                window.location.href = isInsidePages ? 'login.html' : 'pages/login.html';
            }
        } else {
            if (isLoginPage) {
                window.location.href = isInsidePages ? 'dashboard.html' : 'pages/dashboard.html';
            }
        }
        return session;
    },

    // Get Full Profile including Role
    async getProfile() {
        const { user } = await this.getUser();
        if (!user) return null;

        const { data, error } = await supabase
            .from('usuarios')
            .select('*')
            .eq('id', user.id)
            .single();

        if (error) {
            console.error('Error fetching profile:', error);
            return null;
        }
        return data;
    }
};
