// Auth.js - Handles login and signup with Supabase

// Wait for Supabase to be initialized
if (window.supabaseClient) {
    initializeAuth();
} else {
    window.addEventListener('supabase-ready', initializeAuth);
}

function initializeAuth() {
    // Check if already logged in
    checkAuth();

    // Tab switching
    const tabs = document.querySelectorAll('.auth-tab');
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const errorDiv = document.getElementById('auth-error');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.tab;

            // Update active tab
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Show correct form
            if (targetTab === 'login') {
                loginForm.classList.add('active');
                signupForm.classList.remove('active');
            } else {
                loginForm.classList.remove('active');
                signupForm.classList.add('active');
            }

            // Clear errors
            hideError();
        });
    });

    // Login form submission
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError();

        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;

        if (!email || !password) {
            showError('Please fill in all fields');
            return;
        }

        const submitBtn = loginForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>Logging in...</span>';

        try {
            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email: email,
                password: password
            });

            if (error) throw error;

            // Redirect to app
            window.location.href = '/app';
        } catch (error) {
            showError(error.message || 'Login failed');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `
                <span>Login</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
            `;
        }
    });

    // Signup form submission
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError();

        const username = document.getElementById('signup-username').value.trim();
        const email = document.getElementById('signup-email').value.trim();
        const password = document.getElementById('signup-password').value;

        if (!username || !email || !password) {
            showError('Please fill in all fields');
            return;
        }

        if (username.length < 3 || username.length > 20) {
            showError('Username must be 3-20 characters');
            return;
        }

        if (!email.includes('@')) {
            showError('Please enter a valid email address');
            return;
        }

        if (password.length < 6) {
            showError('Password must be at least 6 characters');
            return;
        }

        const submitBtn = signupForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>Creating account...</span>';

        try {
            // Sign up with Supabase Auth
            const { data: authData, error: authError } = await supabaseClient.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: {
                        username: username
                    }
                }
            });

            if (authError) throw authError;

            // Create user profile in profiles table
            if (authData.user) {
                const { error: profileError } = await supabaseClient
                    .from('profiles')
                    .insert({
                        id: authData.user.id,
                        username: username,
                        avatar: '',
                        created_at: new Date().toISOString()
                    });

                if (profileError) {
                    console.error('Profile creation error:', profileError);
                }
            }

            // Check if email confirmation is required
            if (authData.user && !authData.session) {
                showError('Please check your email to confirm your account');
                submitBtn.disabled = false;
                submitBtn.innerHTML = `
                    <span>Create Account</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                `;
                return;
            }

            // Redirect to app
            window.location.href = '/app';
        } catch (error) {
            showError(error.message || 'Signup failed');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `
                <span>Create Account</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
            `;
        }
    });

    function showError(message) {
        errorDiv.textContent = message;
        errorDiv.classList.add('show');
    }

    function hideError() {
        errorDiv.classList.remove('show');
    }
}

// Check if user is already authenticated
async function checkAuth() {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session) {
            // Already logged in, redirect to app
            window.location.href = '/app';
        }
    } catch (error) {
        // Not logged in, stay on auth page
        console.log('Not authenticated');
    }
}

// Create floating particles
function createParticles() {
    const container = document.getElementById('particles');
    if (!container) return;

    for (let i = 0; i < 20; i++) {
        const particle = document.createElement('div');
        particle.style.cssText = `
            position: absolute;
            width: ${Math.random() * 4 + 2}px;
            height: ${Math.random() * 4 + 2}px;
            background: rgba(255, 252, 0, ${Math.random() * 0.3 + 0.1});
            border-radius: 50%;
            left: ${Math.random() * 100}%;
            top: ${Math.random() * 100}%;
            animation: particleFloat ${Math.random() * 10 + 10}s linear infinite;
            animation-delay: ${Math.random() * -10}s;
        `;
        container.appendChild(particle);
    }
}

// Add particle animation
const style = document.createElement('style');
style.textContent = `
    @keyframes particleFloat {
        0% {
            transform: translateY(100vh) rotate(0deg);
            opacity: 0;
        }
        10% {
            opacity: 1;
        }
        90% {
            opacity: 1;
        }
        100% {
            transform: translateY(-100vh) rotate(720deg);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// Initialize particles
createParticles();

// Google Sign-In handler
async function handleGoogleSignIn() {
    try {
        const { data, error } = await supabaseClient.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin + '/app'
            }
        });

        if (error) throw error;
    } catch (error) {
        console.error('Google sign-in error:', error);
        showError('Failed to sign in with Google');
    }
}

// Add event listeners for Google buttons
document.addEventListener('DOMContentLoaded', () => {
    const googleLoginBtn = document.getElementById('google-login-btn');
    const googleSignupBtn = document.getElementById('google-signup-btn');
    
    if (googleLoginBtn) {
        googleLoginBtn.addEventListener('click', handleGoogleSignIn);
    }
    if (googleSignupBtn) {
        googleSignupBtn.addEventListener('click', handleGoogleSignIn);
    }
});
