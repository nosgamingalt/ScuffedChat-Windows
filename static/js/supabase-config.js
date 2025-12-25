// Supabase Configuration - Loaded from environment
let supabaseClient = null;

// Initialize Supabase client asynchronously
(async function initSupabase() {
    try {
        // Fetch configuration from API endpoint
        const response = await fetch('/api/config');
        if (!response.ok) {
            throw new Error('Failed to fetch configuration');
        }

        const config = await response.json();

        if (!config.supabaseUrl || !config.supabaseAnonKey) {
            throw new Error('Invalid configuration received');
        }

        // Initialize Supabase client using the CDN version
        supabaseClient = supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

        // Make it globally available
        window.supabaseClient = supabaseClient;

        console.log('Supabase client initialized successfully');

        // Dispatch event to notify that Supabase is ready
        window.dispatchEvent(new Event('supabase-ready'));
    } catch (error) {
        console.error('Failed to initialize Supabase:', error);
        alert('Failed to load application configuration. Please refresh the page.');
    }
})();
