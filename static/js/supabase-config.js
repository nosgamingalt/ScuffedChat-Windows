// Neon Database Configuration (via Backend API)
// Backend is deployed on Railway.app
const API_BASE_URL = 'https://YOUR-RAILWAY-URL.up.railway.app'; // Update this after Railway deployment

// Create a mock supabaseClient for compatibility with existing code
const supabaseClient = {
    auth: {
        signUp: async (credentials) => {
            const response = await fetch(`${API_BASE_URL}/api/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(credentials)
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Signup failed');
            return { data: { user: data.user }, error: null };
        },
        signInWithPassword: async (credentials) => {
            const response = await fetch(`${API_BASE_URL}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(credentials)
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Login failed');
            return { data: { user: data.user, session: data.session }, error: null };
        },
        signOut: async () => {
            const response = await fetch(`${API_BASE_URL}/api/logout`, {
                method: 'POST',
                credentials: 'include'
            });
            if (!response.ok) throw new Error('Logout failed');
            return { error: null };
        },
        getSession: async () => {
            const response = await fetch(`${API_BASE_URL}/api/session`, {
                credentials: 'include'
            });
            if (!response.ok) return { data: { session: null }, error: null };
            const data = await response.json();
            return { data: { session: data.session }, error: null };
        }
    },
    from: (table) => ({
        select: (fields = '*') => ({
            eq: (column, value) => fetchData(table, 'select', { fields, filter: { [column]: value } }),
            or: (filter) => fetchData(table, 'select', { fields, orFilter: filter }),
            order: (column, options) => ({
                limit: (limit) => fetchData(table, 'select', { fields, order: { column, ...options }, limit })
            }),
            limit: (limit) => fetchData(table, 'select', { fields, limit }),
            single: () => fetchData(table, 'select', { fields, single: true })
        }),
        insert: (data) => ({
            select: () => fetchData(table, 'insert', { data })
        }),
        update: (data) => ({
            eq: (column, value) => fetchData(table, 'update', { data, filter: { [column]: value } })
        }),
        delete: () => ({
            eq: (column, value) => fetchData(table, 'delete', { filter: { [column]: value } }),
            or: (filter) => fetchData(table, 'delete', { orFilter: filter })
        })
    }),
    channel: (name) => ({
        on: (event, filter, callback) => {
            // WebSocket realtime will be handled separately
            return {
                subscribe: () => console.log('Subscribed to', name)
            };
        }
    }),
    removeAllChannels: () => {
        console.log('Channels removed');
    }
};

async function fetchData(table, operation, options = {}) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/${table}/${operation}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(options)
        });
        const result = await response.json();
        if (!response.ok) {
            return { data: null, error: result.error || 'Operation failed' };
        }
        return { data: result.data, error: null };
    } catch (error) {
        return { data: null, error: error.message };
    }
}

// Make it globally available
window.supabaseClient = supabaseClient;

console.log('Neon database client initialized (via backend API)');
