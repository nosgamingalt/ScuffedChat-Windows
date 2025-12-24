// App.js - Main application logic with Supabase

let currentUser = null;
let currentUserProfile = null;
let currentChat = null;
let conversations = [];
let friends = [];
let friendRequests = [];
let disappearingMode = false;
let messageSubscription = null;
let isOnline = navigator.onLine;
let typingTimeout = null;
let conversationsDebounce = null;
let friendsDebounce = null;
let lastConversationsLoad = 0;
let lastFriendsLoad = 0;
const DEBOUNCE_DELAY = 500; // ms
const MIN_RELOAD_INTERVAL = 2000; // ms

// Connection status tracking
window.addEventListener('online', () => {
    isOnline = true;
    updateConnectionStatus();
    showToast('Back online', 'success');
});

window.addEventListener('offline', () => {
    isOnline = false;
    updateConnectionStatus();
    showToast('You are offline', 'error');
});

function updateConnectionStatus() {
    const statusEl = document.querySelector('.status');
    if (statusEl) {
        statusEl.textContent = isOnline ? 'Online' : 'Offline';
        statusEl.classList.toggle('online', isOnline);
        statusEl.classList.toggle('offline', !isOnline);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    // Check authentication
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
            window.location.href = '/';
            return;
        }
        currentUser = session.user;
        
        console.log('User authenticated:', currentUser.email);

        // Get user profile
        const { data: profile, error: profileError } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', currentUser.id)
            .single();

        if (profile) {
            currentUserProfile = profile;
            console.log('Profile loaded:', profile.username);
            
            // Check if username is missing, temporary, or email-based (Google OAuth without username)
            const emailPrefix = currentUser.email.split('@')[0];
            const hasValidUsername = profile.username && 
                                    !profile.username.includes('@') && 
                                    profile.username !== emailPrefix &&
                                    profile.username.length >= 3 &&
                                    !profile.username.startsWith('user_');
            
            if (!hasValidUsername) {
                console.log('Invalid username detected, showing setup modal');
                updateUserProfile(); // Show the current (invalid) username
                showUsernameSetupModal();
                return; // Don't load app until username is set
            }
        } else {
            console.log('No profile found, creating new profile');
            // Create profile if doesn't exist with temporary username
            const tempUsername = 'user_' + currentUser.id.substring(0, 8);
            const { data: newProfile, error: insertError } = await supabaseClient
                .from('profiles')
                .insert({
                    id: currentUser.id,
                    username: tempUsername,
                    email: currentUser.email,
                    avatar: '',
                    created_at: new Date().toISOString()
                })
                .select()
                .single();
            
            if (insertError) {
                console.error('Profile creation error:', insertError);
                throw insertError;
            }
            
            currentUserProfile = newProfile;
            console.log('Profile created with temp username:', tempUsername);
            
            // Always show username setup for new profiles
            updateUserProfile();
            showUsernameSetupModal();
            return; // Don't load app until username is set
        }

        console.log('Updating user profile display');
        updateUserProfile();
        console.log('Initializing app');
        await initializeApp();
    } catch (error) {
        console.error('Auth error:', error);
        window.location.href = '/';
        return;
    }
});

// Cleanup on page unload to prevent connection leaks
window.addEventListener('beforeunload', () => {
    if (messageSubscription) {
        messageSubscription.unsubscribe();
    }
    // Close all Supabase channels
    supabaseClient.removeAllChannels();
});

async function initializeApp() {
    // Load initial data
    await Promise.all([
        loadConversations(),
        loadFriends(),
        loadFriendRequests()
    ]);

    // Setup real-time subscription for messages
    setupRealtimeSubscription();

    // Setup event listeners
    setupEventListeners();
}

function updateUserProfile() {
    if (currentUserProfile) {
        const usernameElement = document.getElementById('username');
        const avatarElement = document.getElementById('user-avatar');
        
        if (!usernameElement || !avatarElement) {
            console.error('Profile elements not found in DOM');
            return;
        }
        
        console.log('Updating profile display:', currentUserProfile.username);
        usernameElement.textContent = currentUserProfile.username;
        
        // Show profile picture if available, otherwise show initial
        if (currentUserProfile.avatar) {
            avatarElement.innerHTML = `<img src="${currentUserProfile.avatar}" alt="Profile" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
        } else {
            avatarElement.innerHTML = '';
            avatarElement.textContent = currentUserProfile.username.charAt(0).toUpperCase();
        }
    } else {
        console.error('currentUserProfile is null or undefined');
    }
}

function setupRealtimeSubscription() {
    // Subscribe to new messages - OPTIMIZED with filter
    messageSubscription = supabaseClient
        .channel('messages')
        .on('postgres_changes',
            { 
                event: 'INSERT', 
                schema: 'public', 
                table: 'messages',
                filter: `receiver_id=eq.${currentUser.id}`
            },
            (payload) => {
                const message = payload.new;
                // Only append if in current chat
                if (currentChat && (message.sender_id === currentChat.id || message.receiver_id === currentChat.id)) {
                    if (message.sender_id !== currentUser.id) {
                        appendMessage(message, true);
                    }
                }
                // Debounced reload
                loadConversations();
            }
        )
        .on('postgres_changes',
            { 
                event: 'DELETE', 
                schema: 'public', 
                table: 'messages'
            },
            (payload) => {
                const messageId = payload.old.id;
                // Remove from UI
                const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
                if (messageElement) {
                    messageElement.remove();
                }
                // Debounced reload only if needed
                if (!currentChat || conversations.length > 0) {
                    loadConversations();
                }
            }
        )
        .on('postgres_changes',
            { 
                event: 'UPDATE', 
                schema: 'public', 
                table: 'messages'
            },
            (payload) => {
                const message = payload.new;
                // Update message in UI if it's in the current chat
                if (currentChat && (message.sender_id === currentChat.id || message.receiver_id === currentChat.id)) {
                    const messageElement = document.querySelector(`[data-message-id="${message.id}"]`);
                    if (messageElement && message.edited) {
                        const contentDiv = messageElement.querySelector('.message-content');
                        if (contentDiv) {
                            contentDiv.innerHTML = linkifyText(message.content);
                            
                            // Add or update edited indicator
                            let editedSpan = messageElement.querySelector('.message-edited');
                            if (!editedSpan) {
                                editedSpan = document.createElement('span');
                                editedSpan.className = 'message-edited';
                                editedSpan.textContent = '(edited)';
                                const timeDiv = messageElement.querySelector('.message-time');
                                if (timeDiv) {
                                    timeDiv.insertBefore(editedSpan, timeDiv.firstChild);
                                }
                            }
                        }
                    }
                }
                // Only reload if this message is in a visible conversation
                if (conversations.some(c => c.user.id === message.sender_id || c.user.id === message.receiver_id)) {
                    loadConversations();
                }
            }
        )
        .subscribe();

    // Subscribe to friend requests
    supabaseClient
        .channel('friends')
        .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'friends', filter: `friend_id=eq.${currentUser.id}` },
            () => {
                loadFriendRequests();
                showToast('New friend request!', 'success');
            }
        )
        .subscribe();
    
    // Subscribe to profile updates
    supabaseClient
        .channel('profiles')
        .on('postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'profiles' },
            (payload) => {
                const updatedProfile = payload.new;
                
                // If it's the current user's profile, update it
                if (updatedProfile.id === currentUser.id) {
                    currentUserProfile = updatedProfile;
                    updateUserProfile();
                }
                
                // Only update if the profile change affects visible data
                if (conversations.some(c => c.user.id === updatedProfile.id)) {
                    loadConversations();
                }
                
                if (friends.some(f => f.id === updatedProfile.id)) {
                    loadFriends();
                }
                
                if (friendRequests.some(r => r.from.id === updatedProfile.id)) {
                    loadFriendRequests();
                }
                
                // If currently chatting with this user, update header only
                if (currentChat && currentChat.id === updatedProfile.id) {
                    currentChat.username = updatedProfile.username;
                    currentChat.avatar = updatedProfile.avatar;
                    document.getElementById('chat-username').textContent = updatedProfile.username;
                    const chatAvatarElement = document.getElementById('chat-avatar');
                    if (updatedProfile.avatar) {
                        chatAvatarElement.innerHTML = `<img src="${updatedProfile.avatar}" alt="${escapeHtml(updatedProfile.username)}">`;
                    } else {
                        chatAvatarElement.textContent = updatedProfile.username.charAt(0).toUpperCase();
                    }
                }
            }
        )
        .subscribe();
}

function setupEventListeners() {
    // Logout
    document.getElementById('logout-btn').addEventListener('click', async () => {
        try {
            console.log('Logging out...');
            
            // Sign out from Supabase
            const { error } = await supabaseClient.auth.signOut();
            
            if (error) {
                console.error('Logout error:', error);
                throw error;
            }
            
            console.log('Logout successful');
            
            // Clear any local state
            currentUser = null;
            currentUserProfile = null;
            currentChat = null;
            conversations = [];
            friends = [];
            friendRequests = [];
            
            // Force redirect to login page
            window.location.replace('/');
            
        } catch (error) {
            console.error('Logout failed:', error);
            showToast('Failed to logout', 'error');
        }
    });

    // Navigation tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const view = tab.dataset.view;

            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            document.getElementById('chats-view').classList.toggle('hidden', view !== 'chats');
            document.getElementById('friends-view').classList.toggle('hidden', view !== 'friends');
        });
    });

    // Search conversations
    document.getElementById('search-conversations').addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        filterConversations(query);
    });

    // Search friends
    document.getElementById('search-friends').addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        filterFriends(query);
    });

    // Add friend
    document.getElementById('add-friend-btn').addEventListener('click', addFriend);
    document.getElementById('add-friend-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addFriend();
        }
    });

    // Back button (mobile)
    document.getElementById('btn-back').addEventListener('click', () => {
        document.getElementById('chat-empty').classList.remove('hidden');
        document.getElementById('chat-active').classList.add('hidden');
        document.getElementById('sidebar').classList.remove('hidden');
        currentChat = null;
    });

    // Clear chat button
    document.getElementById('clear-chat-btn').addEventListener('click', clearChat);

    // Toggle disappearing messages
    document.getElementById('toggle-disappear').addEventListener('click', () => {
        disappearingMode = !disappearingMode;
        document.getElementById('toggle-disappear').classList.toggle('active', disappearingMode);
        document.getElementById('disappear-badge').classList.toggle('hidden', !disappearingMode);
    });

    // Send message
    document.getElementById('send-btn').addEventListener('click', sendMessage);
    
    const messageInput = document.getElementById('message-input');
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // Update send button state based on input
    messageInput.addEventListener('input', () => {
        const sendBtn = document.getElementById('send-btn');
        sendBtn.classList.toggle('has-content', messageInput.value.trim().length > 0);
    });

    // Image upload
    document.getElementById('image-btn').addEventListener('click', () => {
        document.getElementById('image-input').click();
    });

    document.getElementById('image-input').addEventListener('change', handleImageUpload);

    // Context menu for messages
    document.addEventListener('click', () => {
        document.getElementById('message-context-menu').style.display = 'none';
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Escape to close modals and menus
        if (e.key === 'Escape') {
            document.getElementById('message-context-menu').style.display = 'none';
            closeEditMessageModal();
            closeProfileEditModal();
            closeImageViewer();
            closeFriendRequestModal();
        }
        
        // Focus message input with /
        if (e.key === '/' && !e.target.closest('input, textarea')) {
            e.preventDefault();
            const input = document.getElementById('message-input');
            if (input && currentChat) {
                input.focus();
            }
        }
    });
}

// API Functions using Supabase

async function loadConversations() {
    // Debounce to prevent excessive calls
    const now = Date.now();
    if (now - lastConversationsLoad < MIN_RELOAD_INTERVAL) {
        if (conversationsDebounce) clearTimeout(conversationsDebounce);
        conversationsDebounce = setTimeout(loadConversations, DEBOUNCE_DELAY);
        return;
    }
    lastConversationsLoad = now;
    
    try {
        // Optimized: Only get recent messages (last 100) with necessary fields
        const { data: messages, error } = await supabaseClient
            .from('messages')
            .select('id, sender_id, receiver_id, content, type, created_at, read_at, sender:profiles!messages_sender_id_fkey(id, username, avatar), receiver:profiles!messages_receiver_id_fkey(id, username, avatar)')
            .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) throw error;

        // Group by conversation partner
        const convMap = new Map();
        for (const msg of messages || []) {
            const partnerId = msg.sender_id === currentUser.id ? msg.receiver_id : msg.sender_id;
            const partner = msg.sender_id === currentUser.id ? msg.receiver : msg.sender;

            if (!convMap.has(partnerId)) {
                convMap.set(partnerId, {
                    user: partner,
                    last_message: msg,
                    unread_count: 0
                });
            }

            // Count unread (only in recent messages)
            if (msg.sender_id === partnerId && !msg.read_at) {
                const conv = convMap.get(partnerId);
                conv.unread_count++;
            }
        }

        conversations = Array.from(convMap.values());
        renderConversations();
    } catch (error) {
        console.error('Failed to load conversations:', error);
    }
}

async function loadFriends() {
    // Debounce to prevent excessive calls
    const now = Date.now();
    if (now - lastFriendsLoad < MIN_RELOAD_INTERVAL) {
        if (friendsDebounce) clearTimeout(friendsDebounce);
        friendsDebounce = setTimeout(loadFriends, DEBOUNCE_DELAY);
        return;
    }
    lastFriendsLoad = now;
    
    try {
        // Optimized: Only select needed fields
        const { data, error } = await supabaseClient
            .from('friends')
            .select('id, user_id, friend_id, friend:profiles!friends_friend_id_fkey(id, username, avatar), user:profiles!friends_user_id_fkey(id, username, avatar)')
            .or(`user_id.eq.${currentUser.id},friend_id.eq.${currentUser.id}`)
            .eq('status', 'accepted');

        if (error) throw error;

        // Get the friend's profile (not current user's)
        friends = (data || []).map(f => {
            return f.user_id === currentUser.id ? f.friend : f.user;
        }).filter(f => f && f.id !== currentUser.id);

        renderFriends();
    } catch (error) {
        console.error('Failed to load friends:', error);
    }
}

async function loadFriendRequests() {
    try {
        // Optimized: Only select needed fields
        const { data, error } = await supabaseClient
            .from('friends')
            .select('id, user_id, status, created_at, user:profiles!friends_user_id_fkey(id, username, avatar)')
            .eq('friend_id', currentUser.id)
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

        if (error) throw error;

        friendRequests = (data || []).map(req => ({
            id: req.id,
            from: req.user,
            status: req.status,
            created_at: req.created_at
        }));

        renderFriendRequests();
    } catch (error) {
        console.error('Failed to load friend requests:', error);
    }
}

async function loadMessages(partnerId) {
    try {
        // Optimized: Load only last 50 messages, select only needed fields
        const { data: messages, error } = await supabaseClient
            .from('messages')
            .select('id, sender_id, receiver_id, content, type, created_at, expires_at, edited, updated_at')
            .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${currentUser.id})`)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;

        // Reverse to show oldest first
        const sortedMessages = (messages || []).reverse();
        renderMessages(sortedMessages);

        // Mark messages as read (batch operation)
        const { error: updateError } = await supabaseClient
            .from('messages')
            .update({ read_at: new Date().toISOString() })
            .eq('sender_id', partnerId)
            .eq('receiver_id', currentUser.id)
            .is('read_at', null);

        if (updateError) console.error('Failed to mark messages as read:', updateError);

    } catch (error) {
        console.error('Failed to load messages:', error);
    }
}

async function sendMessage() {
    const input = document.getElementById('message-input');
    const content = input.value.trim();

    if (!content || !currentChat) return;

    // Clear input immediately for better UX
    input.value = '';

    try {
        const messageData = {
            sender_id: currentUser.id,
            receiver_id: currentChat.id,
            content: content,
            type: 'text',
            created_at: new Date().toISOString()
        };

        if (disappearingMode) {
            messageData.expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        }

        // Optimistic update - show message immediately with temporary ID
        const tempMessage = { ...messageData, id: 'temp-' + Date.now() };
        appendMessage(tempMessage, false);

        // Scroll to bottom
        const container = document.getElementById('messages-container');
        container.scrollTop = container.scrollHeight;

        // Send to database
        const { data: message, error } = await supabaseClient
            .from('messages')
            .insert(messageData)
            .select()
            .single();

        if (error) throw error;

        // Replace temporary message with real one (update the ID)
        const tempElement = document.querySelector(`[data-message-id="${tempMessage.id}"]`);
        if (tempElement) {
            tempElement.setAttribute('data-message-id', message.id);
        }

    } catch (error) {
        console.error('Failed to send message:', error);
        showToast('Failed to send message', 'error');
        // Restore the message to input on failure
        input.value = content;
    }
}

async function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file || !currentChat) {
        showToast('No file selected or chat not open', 'error');
        return;
    }

    // Check file size (50MB limit)
    if (file.size > 50 * 1024 * 1024) {
        showToast('File must be less than 50MB', 'error');
        e.target.value = '';
        return;
    }

    // Check if it's an image or video
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    
    if (!isImage && !isVideo) {
        showToast('Please select an image or video file', 'error');
        e.target.value = '';
        return;
    }

    try {
        showToast(isVideo ? 'Uploading video...' : 'Uploading image...', 'success');

        // Convert image/video to base64 and send directly in message
        const reader = new FileReader();
        reader.onload = async function(event) {
            try {
                const base64Data = event.target.result;

                // Send message with base64 image or video
                const messageData = {
                    sender_id: currentUser.id,
                    receiver_id: currentChat.id,
                    content: base64Data,
                    type: isVideo ? 'video' : 'image',
                    created_at: new Date().toISOString()
                };

                if (disappearingMode) {
                    messageData.expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
                }

                // Optimistic update - show media immediately
                const tempMessage = { ...messageData, id: 'temp-' + Date.now() };
                appendMessage(tempMessage, false);

                // Scroll to bottom
                const container = document.getElementById('messages-container');
                container.scrollTop = container.scrollHeight;

                const { data: message, error } = await supabaseClient
                    .from('messages')
                    .insert(messageData)
                    .select()
                    .single();

                if (error) {
                    console.error('Database error:', error);
                    throw error;
                }

                // Replace temporary message with real one
                const tempElement = document.querySelector(`[data-message-id="${tempMessage.id}"]`);
                if (tempElement) {
                    tempElement.setAttribute('data-message-id', message.id);
                }

                showToast(isVideo ? 'Video sent!' : 'Image sent!', 'success');

            } catch (error) {
                console.error('Failed to send image:', error);
                showToast('Failed to send image: ' + error.message, 'error');
            }
        };

        reader.onerror = function() {
            showToast('Failed to read image file', 'error');
        };

        reader.readAsDataURL(file);

    } catch (error) {
        console.error('Failed to upload image:', error);
        showToast('Failed to upload image: ' + error.message, 'error');
    } finally {
        e.target.value = '';
    }
}

async function addFriend() {
    const input = document.getElementById('add-friend-input');
    const username = input.value.trim();

    if (!username) return;

    try {
        // Find user by username
        const { data: user, error: findError } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('username', username)
            .single();

        if (findError || !user) {
            showToast('User not found', 'error');
            return;
        }

        if (user.id === currentUser.id) {
            showToast('You cannot add yourself', 'error');
            return;
        }

        // Check if already friends or pending (optimized query)
        const { data: existing } = await supabaseClient
            .from('friends')
            .select('id, status')
            .or(`and(user_id.eq.${currentUser.id},friend_id.eq.${user.id}),and(user_id.eq.${user.id},friend_id.eq.${currentUser.id})`)
            .maybeSingle();

        if (existing) {
            showToast(existing.status === 'accepted' ? 'Already friends' : 'Request already pending', 'error');
            return;
        }

        // Create friend request
        const { error: insertError } = await supabaseClient
            .from('friends')
            .insert({
                user_id: currentUser.id,
                friend_id: user.id,
                status: 'pending',
                created_at: new Date().toISOString()
            });

        if (insertError) throw insertError;

        input.value = '';
        showToast('Friend request sent!', 'success');

    } catch (error) {
        console.error('Failed to add friend:', error);
        showToast('Failed to send friend request', 'error');
    }
}

async function acceptFriendRequest(requestId) {
    try {
        const { error } = await supabaseClient
            .from('friends')
            .update({ status: 'accepted' })
            .eq('id', requestId);

        if (error) throw error;

        showToast('Friend request accepted!', 'success');
        await Promise.all([loadFriends(), loadFriendRequests()]);

    } catch (error) {
        showToast('Failed to accept request', 'error');
    }
}

async function declineFriendRequest(requestId) {
    try {
        const { error } = await supabaseClient
            .from('friends')
            .delete()
            .eq('id', requestId);

        if (error) throw error;

        showToast('Friend request declined', 'success');
        await loadFriendRequests();

    } catch (error) {
        showToast('Failed to decline request', 'error');
    }
}

async function removeFriend(friendId, friendUsername) {
    if (!confirm(`Remove ${friendUsername} from your friends?`)) {
        return;
    }

    try {
        // Find the friendship record (could be either direction)
        const { data: friendships, error: fetchError } = await supabaseClient
            .from('friends')
            .select('id')
            .eq('status', 'accepted')
            .or(`and(user_id.eq.${currentUser.id},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${currentUser.id})`);

        if (fetchError) throw fetchError;

        if (!friendships || friendships.length === 0) {
            showToast('Friend not found', 'error');
            return;
        }

        // Delete the friendship
        const { error } = await supabaseClient
            .from('friends')
            .delete()
            .eq('id', friendships[0].id);

        if (error) throw error;

        showToast('Friend removed', 'success');
        await loadFriends();

    } catch (error) {
        console.error('Error removing friend:', error);
        showToast('Failed to remove friend', 'error');
    }
}

// Clear Chat Function
async function clearChat() {
    if (!currentChat) return;
    
    if (!confirm(`Clear all messages with ${currentChat.username}? This cannot be undone.`)) {
        return;
    }
    
    try {
        // Delete all messages between current user and chat partner (both directions)
        const { error } = await supabaseClient
            .from('messages')
            .delete()
            .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${currentChat.id}),and(sender_id.eq.${currentChat.id},receiver_id.eq.${currentUser.id})`);
        
        if (error) throw error;
        
        // Clear UI
        document.getElementById('messages-list').innerHTML = `
            <div class="empty-state">
                <p>No messages yet</p>
                <span>Say hello! 👋</span>
            </div>
        `;
        
        showToast('Chat cleared', 'success');
        
        // Reload conversations to update the list
        loadConversations();
        
    } catch (error) {
        console.error('Failed to clear chat:', error);
        showToast('Failed to clear chat', 'error');
    }
}

// Render Functions

function renderConversations() {
    const container = document.getElementById('conversations-list');

    if (!conversations || conversations.length === 0) {
        // Don't show empty state on mobile
        if (window.innerWidth < 768) {
            container.innerHTML = '';
        } else {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">💬</div>
                    <p>No conversations yet</p>
                    <span>Add friends to start chatting!</span>
                </div>
            `;
        }
        return;
    }

    container.innerHTML = conversations.map(conv => {
        // Format last message preview
        let previewText = 'Start a conversation';
        if (conv.last_message) {
            if (conv.last_message.type === 'image') {
                previewText = '📷 Image';
            } else if (conv.last_message.type === 'video') {
                previewText = '🎥 Video';
            } else {
                previewText = escapeHtml(truncate(conv.last_message.content, 30));
            }
        }
        
        return `
        <button class="conversation-item ${currentChat && currentChat.id === conv.user.id ? 'active' : ''}" 
                data-user-id="${conv.user.id}"
                onclick="openChat('${conv.user.id}')">
            <div class="avatar">
                ${conv.user.avatar ? `<img src="${escapeHtml(conv.user.avatar)}" alt="Avatar">` : `<span>${conv.user.username.charAt(0).toUpperCase()}</span>`}
            </div>
            <div class="conversation-info">
                <div class="conversation-name">
                    <span class="conversation-username">${escapeHtml(conv.user.username)}</span>
                    ${conv.last_message ? `
                        <span class="conversation-time">${formatTime(conv.last_message.created_at)}</span>
                    ` : ''}
                </div>
                <div class="conversation-preview">
                    <span>${previewText}</span>
                    ${conv.unread_count > 0 ? `<span class="unread-badge">${conv.unread_count}</span>` : ''}
                </div>
            </div>
        </button>
    `;
    }).join('');
}

function filterConversations(query) {
    const items = document.querySelectorAll('.conversation-item');
    items.forEach(item => {
        const username = item.querySelector('.conversation-username').textContent.toLowerCase();
        item.style.display = username.includes(query) ? '' : 'none';
    });
}

function filterFriends(query) {
    const items = document.querySelectorAll('.friends-list .friend-item');
    items.forEach(item => {
        const name = item.querySelector('.friend-name').textContent.toLowerCase();
        item.style.display = name.includes(query) ? '' : 'none';
    });
}

function renderFriends() {
    const container = document.getElementById('friends-list');

    if (!friends || friends.length === 0) {
        container.innerHTML = `
            <div class="empty-state small">
                <p>No friends yet</p>
            </div>
        `;
        return;
    }

    container.innerHTML = friends.map(friend => `
        <div class="friend-item">
            <div class="avatar">
                ${friend.avatar ? `<img src="${escapeHtml(friend.avatar)}" alt="Avatar">` : `<span>${friend.username.charAt(0).toUpperCase()}</span>`}
            </div>
            <div class="friend-info">
                <span class="friend-name">${escapeHtml(friend.username)}</span>
                <span class="friend-status">Friend</span>
            </div>
            <div class="friend-actions">
                <button class="btn-message" onclick="openChat('${friend.id}')">Message</button>
                <button class="btn-decline" onclick="removeFriend('${friend.id}', '${escapeHtml(friend.username)}')">Remove</button>
            </div>
        </div>
    `).join('');
}

function renderFriendRequests() {
    const container = document.getElementById('friend-requests-list');
    const section = document.getElementById('friend-requests-section');
    const badge = document.getElementById('friend-requests-badge');

    if (!friendRequests || friendRequests.length === 0) {
        section.style.display = 'none';
        badge.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    badge.style.display = 'flex';
    badge.textContent = friendRequests.length;

    container.innerHTML = friendRequests.map(req => {
        const username = escapeHtml(req.from.username);
        const initial = req.from.username.charAt(0).toUpperCase();
        const avatar = req.from.avatar;
        return `
            <div class="friend-item" data-request-id="${req.id}" data-username="${username}" style="cursor: pointer;">
                <div class="avatar">
                    ${avatar ? `<img src="${escapeHtml(avatar)}" alt="Avatar">` : `<span>${initial}</span>`}
                </div>
                <div class="friend-info">
                    <span class="friend-name">${username}</span>
                    <span class="friend-status">Wants to be friends</span>
                </div>
                <div class="friend-actions" onclick="event.stopPropagation();">
                    <button class="btn-accept" onclick="acceptFriendRequest(${req.id})">Accept</button>
                    <button class="btn-decline" onclick="declineFriendRequest(${req.id})">Decline</button>
                </div>
            </div>
        `;
    }).join('');

    // Add click handlers
    container.querySelectorAll('.friend-item').forEach(item => {
        item.addEventListener('click', () => {
            const requestId = item.getAttribute('data-request-id');
            const username = item.getAttribute('data-username');
            showFriendRequestModal(requestId, username);
        });
    });
}

function renderMessages(messages) {
    const container = document.getElementById('messages-list');

    if (!messages || messages.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>No messages yet</p>
                <span>Say hello! 👋</span>
            </div>
        `;
        return;
    }

    container.innerHTML = messages.map(msg => createMessageHTML(msg, msg.sender_id !== currentUser.id)).join('');

    // Scroll to bottom
    const messagesContainer = document.getElementById('messages-container');
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function appendMessage(message, received) {
    const container = document.getElementById('messages-list');
    const emptyState = container.querySelector('.empty-state');

    if (emptyState) {
        emptyState.remove();
    }

    container.insertAdjacentHTML('beforeend', createMessageHTML(message, received));

    // Scroll to bottom
    const messagesContainer = document.getElementById('messages-container');
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Make URLs clickable in messages
function linkifyText(text) {
    const urlRegex = /(https?:\/\/[^\s<>"']+)/g;
    const escaped = escapeHtml(text);
    return escaped.replace(urlRegex, (url) => {
        // Decode HTML entities for the href, keep escaped for display
        const safeUrl = url.replace(/&amp;/g, '&');
        return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="message-link">${url}</a>`;
    });
}

function createMessageHTML(message, received) {
    const hasExpiry = message.expires_at != null;
    const isImage = message.type === 'image';
    const isVideo = message.type === 'video';
    const isEdited = message.edited || false;
    
    let contentHTML;
    if (isImage) {
        contentHTML = `<img src="${escapeHtml(message.content)}" alt="Image" class="message-image" loading="lazy" onclick="openImageViewer('${escapeHtml(message.content)}')">`;
    } else if (isVideo) {
        contentHTML = `<video src="${escapeHtml(message.content)}" class="message-video" controls preload="metadata"></video>`;
    } else {
        contentHTML = `<div class="message-content">${linkifyText(message.content)}</div>`;
    }

    return `
        <div class="message ${received ? 'received' : 'sent'}" 
             data-message-id="${message.id}" 
             oncontextmenu="showMessageContextMenu(event, ${message.id}, ${!received})"
             ontouchstart="handleLongPressStart(event, ${message.id}, ${!received})"
             ontouchend="handleLongPressEnd()"
             ontouchmove="handleLongPressEnd()">
            <div class="message-bubble">
                ${contentHTML}
                <div class="message-time">
                    ${isEdited ? '<span class="message-edited">(edited)</span>' : ''}
                    ${hasExpiry ? `
                        <span class="message-disappear">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"/>
                                <polyline points="12 6 12 12 16 14"/>
                            </svg>
                        </span>
                    ` : ''}
                    ${formatTime(message.created_at)}
                </div>
            </div>
        </div>
    `;
}

window.openChat = async function (partnerId) {
    // Find user info
    let user = conversations.find(c => c.user.id === partnerId)?.user;
    if (!user) {
        user = friends.find(f => f.id === partnerId);
    }

    if (!user) {
        // Try to fetch from supabase
        const { data } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', partnerId)
            .single();
        user = data;
    }

    if (!user) {
        showToast('User not found', 'error');
        return;
    }

    currentChat = user;

    // Update UI
    document.getElementById('chat-empty').classList.add('hidden');
    document.getElementById('chat-active').classList.remove('hidden');
    document.getElementById('sidebar').classList.add('hidden'); // Mobile

    // Update chat header
    const chatAvatarElement = document.getElementById('chat-avatar');
    if (user.avatar) {
        chatAvatarElement.innerHTML = `<img src="${user.avatar}" alt="${escapeHtml(user.username)}">`;
    } else {
        chatAvatarElement.textContent = user.username.charAt(0).toUpperCase();
    }
    document.getElementById('chat-username').textContent = user.username;
    document.getElementById('chat-status').textContent = 'Online';

    // Update active conversation
    document.querySelectorAll('.conversation-item').forEach(item => {
        item.classList.toggle('active', item.dataset.userId === partnerId);
    });

    // Load messages
    await loadMessages(partnerId);

    // Refresh conversations to update unread count
    loadConversations();
}

// Utility Functions

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function truncate(text, length) {
    if (text.length <= length) return text;
    return text.substring(0, length) + '...';
}

function formatTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;

    // Less than 1 minute
    if (diff < 60000) return 'now';

    // Less than 1 hour
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;

    // Less than 24 hours
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;

    // Same year
    if (date.getFullYear() === now.getFullYear()) {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${type === 'success' ? '✓' : '✕'}</span>
        <span class="toast-message">${escapeHtml(message)}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'toastIn 0.3s ease-out reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function showFriendRequestModal(requestId, username) {
    const modal = document.getElementById('friend-request-modal');
    const avatarText = document.getElementById('modal-avatar-text');
    const usernameEl = document.getElementById('modal-username');
    const acceptBtn = document.getElementById('modal-accept-btn');
    const declineBtn = document.getElementById('modal-decline-btn');

    avatarText.textContent = username.charAt(0).toUpperCase();
    usernameEl.textContent = username;

    acceptBtn.onclick = () => {
        acceptFriendRequest(requestId);
        closeFriendRequestModal();
    };

    declineBtn.onclick = () => {
        declineFriendRequest(requestId);
        closeFriendRequestModal();
    };

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeFriendRequestModal() {
    const modal = document.getElementById('friend-request-modal');
    modal.style.display = 'none';
    document.body.style.overflow = '';
}

let selectedMessageId = null;
let longPressTimer = null;

function showMessageContextMenu(event, messageId, isSentByMe) {
    event.preventDefault();
    
    if (!isSentByMe) return; // Only show context menu for messages you sent
    
    selectedMessageId = messageId;
    const menu = document.getElementById('message-context-menu');
    
    menu.style.display = 'block';
    
    // Improved positioning for both desktop and mobile
    const menuWidth = 180;
    const menuHeight = 100; // approximate height
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let left = event.pageX - menuWidth - 10;
    let top = event.pageY;
    
    // Adjust for mobile - center horizontally if too close to edges
    if (viewportWidth < 768) {
        left = Math.max(10, Math.min(left, viewportWidth - menuWidth - 10));
        top = Math.max(10, Math.min(top, viewportHeight - menuHeight - 10));
    }
    
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    
    // Set up button handlers
    const deleteBtn = document.getElementById('delete-message-btn');
    const editBtn = document.getElementById('edit-message-btn');
    
    deleteBtn.onclick = () => {
        deleteMessage(messageId);
        menu.style.display = 'none';
    };
    editBtn.onclick = () => {
        editMessage(messageId);
        menu.style.display = 'none';
    };
    
    // Close menu when clicking outside
    const closeMenu = (e) => {
        if (!menu.contains(e.target)) {
            menu.style.display = 'none';
            document.removeEventListener('click', closeMenu);
            document.removeEventListener('touchstart', closeMenu);
        }
    };
    
    // Delay adding the listener to prevent immediate closure
    setTimeout(() => {
        document.addEventListener('click', closeMenu);
        document.addEventListener('touchstart', closeMenu);
    }, 100);
}

function handleLongPressStart(event, messageId, isSentByMe) {
    if (!isSentByMe) return;
    
    // Store touch position for mobile
    const touch = event.touches ? event.touches[0] : event;
    const touchX = touch.clientX;
    const touchY = touch.clientY;
    
    longPressTimer = setTimeout(() => {
        // Create a synthetic event with the stored position
        const syntheticEvent = {
            preventDefault: () => {},
            pageX: touchX,
            pageY: touchY,
            clientX: touchX,
            clientY: touchY
        };
        
        // Trigger context menu on long press
        showMessageContextMenu(syntheticEvent, messageId, isSentByMe);
        
        // Add haptic feedback on mobile if available
        if (navigator.vibrate) {
            navigator.vibrate(50);
        }
    }, 500); // 500ms long press
}

function handleLongPressEnd() {
    if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
    }
}

async function editMessage(messageId) {
    try {
        // Hide context menu
        document.getElementById('message-context-menu').style.display = 'none';
        
        // Get the message element
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (!messageElement) return;
        
        // Get current message content
        const contentDiv = messageElement.querySelector('.message-content');
        if (!contentDiv) {
            showToast('Cannot edit image messages', 'error');
            return;
        }
        
        const currentContent = contentDiv.textContent;
        
        // Show custom edit modal
        showEditMessageModal(messageId, currentContent);
        
    } catch (error) {
        console.error('Failed to open edit message:', error);
        showToast('Failed to open edit', 'error');
    }
}

function showEditMessageModal(messageId, currentContent) {
    const modal = document.getElementById('edit-message-modal');
    const form = document.getElementById('edit-message-form');
    const textarea = document.getElementById('edit-message-textarea');
    const error = document.getElementById('edit-message-error');
    
    modal.style.display = 'flex';
    textarea.value = currentContent;
    error.style.display = 'none';
    
    // Focus and select text
    setTimeout(() => {
        textarea.focus();
        textarea.select();
    }, 100);
    
    form.onsubmit = async (e) => {
        e.preventDefault();
        const newContent = textarea.value.trim();
        
        if (newContent === '') {
            error.textContent = 'Message cannot be empty';
            error.style.display = 'block';
            return;
        }
        
        if (newContent === currentContent) {
            modal.style.display = 'none';
            return;
        }
        
        try {
            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Saving...';
            
            // Update in database
            const { error: updateError } = await supabaseClient
                .from('messages')
                .update({ 
                    content: newContent,
                    edited: true,
                    updated_at: new Date().toISOString()
                })
                .eq('id', messageId)
                .eq('sender_id', currentUser.id);
            
            if (updateError) {
                console.error('Edit error:', updateError);
                throw updateError;
            }
            
            // Update UI
            const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
            if (messageElement) {
                const contentDiv = messageElement.querySelector('.message-content');
                if (contentDiv) {
                    contentDiv.textContent = newContent;
                }
                
                // Add edited indicator if not present
                let editedSpan = messageElement.querySelector('.message-edited');
                if (!editedSpan) {
                    editedSpan = document.createElement('span');
                    editedSpan.className = 'message-edited';
                    editedSpan.textContent = '(edited)';
                    const timeDiv = messageElement.querySelector('.message-time');
                    if (timeDiv) {
                        timeDiv.insertBefore(editedSpan, timeDiv.firstChild);
                    }
                }
            }
            
            modal.style.display = 'none';
            showToast('Message edited', 'success');
            
            // Reload conversations to update preview
            loadConversations();
            
        } catch (err) {
            console.error('Failed to edit message:', err);
            error.textContent = 'Failed to edit message';
            error.style.display = 'block';
            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Save';
        }
    };
}

function closeEditMessageModal() {
    const modal = document.getElementById('edit-message-modal');
    modal.style.display = 'none';
}

async function deleteMessage(messageId) {
    try {
        // Delete from database - only if you're the sender
        const { error } = await supabaseClient
            .from('messages')
            .delete()
            .eq('id', messageId)
            .eq('sender_id', currentUser.id);

        if (error) {
            console.error('Delete error:', error);
            throw error;
        }

        // Remove from UI
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageElement) {
            messageElement.remove();
        }

        // Hide context menu
        document.getElementById('message-context-menu').style.display = 'none';
        
        showToast('Message deleted', 'success');
        
        // Reload conversations to update preview
        loadConversations();
    } catch (error) {
        console.error('Failed to delete message:', error);
        showToast('Failed to delete message', 'error');
    }
}

window.showMessageContextMenu = showMessageContextMenu;
window.handleLongPressStart = handleLongPressStart;
window.handleLongPressEnd = handleLongPressEnd;

function openImageViewer(imageSrc) {
    const viewer = document.getElementById('image-viewer');
    const img = document.getElementById('image-viewer-img');
    img.src = imageSrc;
    viewer.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeImageViewer() {
    const viewer = document.getElementById('image-viewer');
    viewer.style.display = 'none';
    document.body.style.overflow = '';
}

window.openImageViewer = openImageViewer;
window.closeImageViewer = closeImageViewer;

// Username Setup Modal
function showUsernameSetupModal() {
    console.log('showUsernameSetupModal called');
    const modal = document.getElementById('username-setup-modal');
    const form = document.getElementById('username-setup-form');
    const input = document.getElementById('setup-username-input');
    const error = document.getElementById('username-setup-error');
    
    if (!modal) {
        console.error('Username setup modal not found in DOM');
        return;
    }
    
    console.log('Displaying username setup modal');
    modal.style.display = 'flex';
    input.value = '';
    error.style.display = 'none';
    
    // Focus on input
    setTimeout(() => input.focus(), 100);
    
    // Prevent closing modal by clicking outside
    modal.onclick = (e) => {
        if (e.target === modal) {
            e.stopPropagation();
            e.preventDefault();
            console.log('Modal click prevented - username required');
        }
    };
    
    form.onsubmit = async (e) => {
        e.preventDefault();
        const username = input.value.trim();
        
        console.log('Username submitted:', username);
        
        if (username.length < 3 || username.length > 20) {
            error.textContent = 'Username must be 3-20 characters';
            error.style.display = 'block';
            return;
        }
        
        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            error.textContent = 'Username can only contain letters, numbers, and underscores';
            error.style.display = 'block';
            return;
        }
        
        try {
            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Setting up...';
            
            // Check if username exists
            const { data: existing } = await supabaseClient
                .from('profiles')
                .select('id')
                .eq('username', username)
                .single();
            
            if (existing && existing.id !== currentUser.id) {
                error.textContent = 'Username already taken';
                error.style.display = 'block';
                submitBtn.disabled = false;
                submitBtn.textContent = 'Continue';
                return;
            }
            
            console.log('Updating username in database...');
            
            // Update profile
            const { error: updateError } = await supabaseClient
                .from('profiles')
                .update({ username: username })
                .eq('id', currentUser.id);
            
            if (updateError) {
                console.error('Update error:', updateError);
                throw updateError;
            }
            
            console.log('Username updated successfully');
            
            currentUserProfile.username = username;
            updateUserProfile();
            modal.style.display = 'none';
            showToast('Username set successfully!', 'success');
            
            // Now initialize the app
            console.log('Initializing app...');
            await initializeApp();
            
        } catch (err) {
            console.error('Username setup error:', err);
            error.textContent = 'Failed to set username';
            error.style.display = 'block';
            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Continue';
        }
    };
}

// Profile Edit Modal
function openProfileEdit() {
    const modal = document.getElementById('profile-edit-modal');
    const form = document.getElementById('profile-edit-form');
    const input = document.getElementById('edit-username-input');
    const error = document.getElementById('profile-edit-error');
    const avatarPreview = document.getElementById('profile-avatar-preview');
    const pictureInput = document.getElementById('profile-picture-input');
    
    modal.style.display = 'flex';
    input.value = currentUserProfile.username;
    error.style.display = 'none';
    
    // Set current avatar
    if (currentUserProfile.avatar) {
        avatarPreview.innerHTML = `<img src="${currentUserProfile.avatar}" alt="Profile">`;
    } else {
        avatarPreview.textContent = currentUserProfile.username.charAt(0).toUpperCase();
    }
    
    let selectedAvatar = null;
    
    // Handle profile picture selection
    pictureInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        // Validate file size (5MB)
        if (file.size > 5 * 1024 * 1024) {
            error.textContent = 'Image must be less than 5MB';
            error.style.display = 'block';
            return;
        }
        
        // Validate file type
        if (!file.type.startsWith('image/')) {
            error.textContent = 'Please select a valid image file';
            error.style.display = 'block';
            return;
        }
        
        error.style.display = 'none';
        
        // Read and preview the image
        const reader = new FileReader();
        reader.onload = (event) => {
            selectedAvatar = event.target.result;
            avatarPreview.innerHTML = `<img src="${selectedAvatar}" alt="Profile Preview">`;
            showToast('Photo selected. Click Save to apply', 'success');
        };
        reader.readAsDataURL(file);
    };
    
    form.onsubmit = async (e) => {
        e.preventDefault();
        const username = input.value.trim();
        
        const usernameChanged = username !== currentUserProfile.username;
        const avatarChanged = selectedAvatar !== null;
        
        if (!usernameChanged && !avatarChanged) {
            modal.style.display = 'none';
            return;
        }
        
        if (username.length < 3 || username.length > 20) {
            error.textContent = 'Username must be 3-20 characters';
            error.style.display = 'block';
            return;
        }
        
        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            error.textContent = 'Username can only contain letters, numbers, and underscores';
            error.style.display = 'block';
            return;
        }
        
        try {
            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Saving...';
            
            // Check if username exists (only if changed)
            if (usernameChanged) {
                const { data: existing } = await supabaseClient
                    .from('profiles')
                    .select('id')
                    .eq('username', username)
                    .single();
                
                if (existing && existing.id !== currentUser.id) {
                    error.textContent = 'Username already taken';
                    error.style.display = 'block';
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Save Changes';
                    return;
                }
            }
            
            // Prepare update data
            const updateData = {};
            if (usernameChanged) {
                updateData.username = username;
            }
            if (avatarChanged) {
                updateData.avatar = selectedAvatar;
            }
            
            // Update profile
            const { error: updateError } = await supabaseClient
                .from('profiles')
                .update(updateData)
                .eq('id', currentUser.id);
            
            if (updateError) throw updateError;
            
            // Update local profile
            if (usernameChanged) {
                currentUserProfile.username = username;
            }
            if (avatarChanged) {
                currentUserProfile.avatar = selectedAvatar;
            }
            
            updateUserProfile();
            modal.style.display = 'none';
            showToast('Profile updated successfully!', 'success');
            
            // Reload conversations to update display
            loadConversations();
            
        } catch (err) {
            console.error('Profile update error:', err);
            error.textContent = 'Failed to update profile';
            error.style.display = 'block';
            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Save Changes';
        }
    };
}

function closeProfileEditModal() {
    const modal = document.getElementById('profile-edit-modal');
    modal.style.display = 'none';
}

window.openProfileEdit = openProfileEdit;
window.closeProfileEditModal = closeProfileEditModal;
window.closeEditMessageModal = closeEditMessageModal;
