// ... (imports remain)
import { supabase } from '../supabase'

/**
 * 2. Backend Layer: Data & Logic Service (Central Brain)
 * Role: Single source of truth for identity, state, and coordination via Supabase.
 * Optimized for high performance and scalability with backend radius discovery.
 */

// Internal State (The Single Source of Truth)
const state = {
    currentUser: null,
    currentProfile: null,
    isLive: false,
    currentLocation: { lat: 0, lng: 0 }
};

const subscribers = [];

function notifySubscribers() {
    const user = dataService.getCurrentUser();
    subscribers.forEach(cb => cb(user, state.isLive));
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

export const dataService = {
    // --- AUTHENTICATION ---
    signUp: async (email, password, fullName) => {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: { data: { full_name: fullName } }
        })
        if (error) throw error
        return data
    },

    login: async (email, password) => {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        state.currentUser = data.user
        await dataService.fetchProfile()
        return data
    },

    logout: async () => {
        const { error } = await supabase.auth.signOut()
        if (error) throw error
        state.currentUser = null
        state.currentProfile = null
        state.isLive = false
        subscribers.length = 0 // Clear all listeners
    },

    checkSession: async () => {
        const { data: { session } } = await supabase.auth.getSession()
        state.currentUser = session?.user || null
        if (state.currentUser) {
            await dataService.fetchProfile()
            notifySubscribers() // Initial state push
        }
        return state.currentUser
    },

    /**
     * Subscribe to global state changes (Profile, Availability)
     * @param {function} callback - (user, isLive) => void
     */
    subscribe: (callback) => {
        subscribers.push(callback);
        // Immediate callback with current state
        callback(dataService.getCurrentUser(), state.isLive);
        return () => {
            const index = subscribers.indexOf(callback);
            if (index > -1) subscribers.splice(index, 1);
        }
    },

    // --- PROFILE MANAGEMENT ---
    fetchProfile: async () => {
        if (!state.currentUser) return null

        // Explicitly re-fetch profile to ensure freshness
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', state.currentUser.id)
            .single()

        if (data) state.currentProfile = data

        const { data: avail } = await supabase
            .from('availability')
            .select('is_available')
            .eq('user_id', state.currentUser.id)
            .single()

        if (avail) state.isLive = avail.is_available

        // Fetch current location
        const { data: loc } = await supabase
            .from('locations')
            .select('latitude, longitude')
            .eq('user_id', state.currentUser.id)
            .single()

        if (loc) state.currentLocation = { lat: loc.latitude, lng: loc.longitude }
        else state.currentLocation = { lat: 0, lng: 0 }

        return state.currentProfile
    },

    getCurrentUser: () => {
        if (!state.currentUser) return null
        // Merge Auth User + Profile Data
        return {
            id: state.currentUser.id,
            name: state.currentProfile?.full_name || state.currentUser.email.split('@')[0],
            initials: (state.currentProfile?.full_name || state.currentUser.email).substring(0, 2).toUpperCase(),
            avatar_url: state.currentProfile?.avatar_url,
            role: state.currentProfile?.role || 'Member',
            bio: state.currentProfile?.bio || 'SkillOGeo Professional',
            interests: state.currentProfile?.interests || [],
            phone: state.currentProfile?.phone,
            icon: '👤',
            lat: state.currentLocation.lat,
            lng: state.currentLocation.lng
        }
    },

    getUserById: async (id) => {
        const { data } = await supabase.from('profiles').select('*').eq('id', id).single()
        return data
    },

    updateProfile: async (updates) => {
        if (!state.currentUser) return null;

        const { error } = await supabase
            .from('profiles')
            .update({
                full_name: updates.name,
                role: updates.role,
                bio: updates.bio,
                interests: updates.interests,
                phone: updates.phone,
                updated_at: new Date().toISOString()
            })
            .eq('id', state.currentUser.id);

        if (error) throw error;

        // Critical: Re-fetch ensures the local state matches the DB exactly
        await dataService.fetchProfile();

        notifySubscribers(); // Notify UI to re-render
        return state.currentProfile;
    },

    uploadAvatar: async (file) => {
        if (!state.currentUser) return null;
        const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', 'ml_default');
        formData.append('folder', 'skillogeo_avatars');

        try {
            const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
                method: 'POST',
                body: formData
            });
            const data = await response.json();
            if (data.secure_url) {
                await supabase.from('profiles')
                    .update({ avatar_url: data.secure_url })
                    .eq('id', state.currentUser.id);

                // Update local state immediately for responsiveness, then fetch to confirm
                if (state.currentProfile) state.currentProfile.avatar_url = data.secure_url;

                await dataService.fetchProfile();
                notifySubscribers(); // Notify UI
                return data.secure_url;
            }
            throw new Error(data.error?.message || 'Upload failed');
        } catch (err) {
            console.error('Cloudinary Error:', err);
            throw err;
        }
    },

    /**
     * HEARTBEAT & AVAILABILITY
     * Users must "check-in" periodically. If the frontend is open, we send a heartbeat.
     * If they go inactive (e.g. detailed in Postgres function), they are marked offline.
     */
    sendHeartbeat: async () => {
        if (!state.currentUser || !state.isLive) return;

        // Update last_active_at timestamp to keep the session alive
        await supabase
            .from('availability')
            .update({ last_active_at: new Date().toISOString() })
            .eq('user_id', state.currentUser.id);
    },

    setAvailability: async (status) => {
        if (!state.currentUser) return false
        const { error } = await supabase
            .from('availability')
            .update({ is_available: status, last_active_at: new Date().toISOString() })
            .eq('user_id', state.currentUser.id)

        if (!error) {
            state.isLive = status
            notifySubscribers() // Notify UI
        }
        return state.isLive;
    },

    getAvailability: () => state.isLive,

    setUserLocation: async (lat, lng) => {
        if (!state.currentUser) return

        state.currentLocation = { lat, lng } // Update local state immediately

        await supabase
            .from('locations')
            .update({ latitude: lat, longitude: lng, updated_at: new Date().toISOString() })
            .eq('user_id', state.currentUser.id)
    },

    /**
     * DISCOVERY (Backend Radius Logic)
     * No polling, no client-side filtering. 
     * Uses Postgres RPC to scale.
     */
    getNearbyUsers: async (searchTerm = '') => {
        if (!state.isLive || !state.currentUser) return [];

        // 1. Get my current location from database
        const { data: myLoc } = await supabase
            .from('locations')
            .select('latitude, longitude')
            .eq('user_id', state.currentUser.id)
            .single()

        if (!myLoc) return []

        // 2. Call Postgres function for distance-restricted search
        const { data: nearby, error } = await supabase.rpc('get_nearby_users', {
            my_lat: myLoc.latitude,
            my_lng: myLoc.longitude,
            radius_km: 15.0,
            search_term: searchTerm
        })

        if (error || !nearby) return []

        return nearby.map(u => ({
            id: u.id,
            name: u.full_name || 'Anonymous',
            role: u.role || 'Professional',
            avatar_url: u.avatar_url,
            lat: u.latitude,
            lng: u.longitude,
            initials: (u.full_name || 'A').substring(0, 2).toUpperCase(),
            icon: '👤',
            distance: `${u.distance_km.toFixed(1)}km away`,
            bio: u.bio || "SkillOGeo Professional",
            interests: u.interests || ["Networking"],
            phone: u.phone
        }))
    },

    // --- MESSAGING ---
    sendMessage: async (receiverId, content) => {
        if (!state.currentUser) return null;
        const { data, error } = await supabase
            .from('messages')
            .insert([{ sender_id: state.currentUser.id, receiver_id: receiverId, content: content }]);
        if (error) throw error;
        return data;
    },

    getMessages: async (otherUserId) => {
        if (!state.currentUser) return [];
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .or(`and(sender_id.eq.${state.currentUser.id},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${state.currentUser.id})`)
            .order('created_at', { ascending: true });
        if (error) throw error;
        return data;
    },

    subscribeToMessages: (callback) => {
        if (!state.currentUser) return null;
        return supabase
            .channel('public:messages')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: `receiver_id=eq.${state.currentUser.id}`
            }, (payload) => callback(payload.new))
            .subscribe();
    }
}
