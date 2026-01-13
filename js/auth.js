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
            window.location.href = '/pages/login.html';
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
        const isLoginPage = window.location.pathname.endsWith('login.html');

        if (!session) {
            // If not logged in and not on login page, redirect
            if (!isLoginPage) {
                window.location.href = '/pages/login.html';
            }
        } else {
            // If logged in and on login page, redirect to dashboard
            if (isLoginPage) {
                window.location.href = '/pages/dashboard.html';
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
