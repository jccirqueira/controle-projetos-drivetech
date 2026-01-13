
// Supabase Client Setup
// NOTE: Use local storage or build environment variables in a real production build.
// For this vanilla JS setup, we need the user to provide their keys.

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// TODO: REPLACE THESE WITH YOUR ACTUAL SUPABASE URL AND ANON KEY
const SUPABASE_URL = 'https://ukohhgswfjwlzdlyjpmx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVrb2hoZ3N3Zmp3bHpkbHlqcG14Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyNDk2MDAsImV4cCI6MjA4MzgyNTYwMH0.ZW9joLWbuGjYlqMz_UqbE463tM9nvAg4OotaXdQY6d8';

if (SUPABASE_URL === 'YOUR_SUPABASE_URL_HERE') {
    console.error('Supabase URL and Key are missing. Please configure js/supabaseClient.js');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
