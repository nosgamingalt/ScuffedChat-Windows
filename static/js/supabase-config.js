// Supabase Configuration
const SUPABASE_URL = 'https://piygecuivbkawnkpdxnk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ZcDJIt_-SIYUm-gWAywUtQ_BCM28oMf';

// Initialize Supabase client using the CDN version
// The CDN exposes supabase as a global object with createClient method
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Make it globally available
window.supabaseClient = supabaseClient;

console.log('Supabase client initialized');
