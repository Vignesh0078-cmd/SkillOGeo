import { supabase } from '../supabase'

/**
 * 2. Backend Layer: Data & Logic Service (Central Brain)
 * Role: Single source of truth for identity, state, and coordination via Supabase.
 * Optimized for high performance and scalability with backend radius discovery.
 */

let currentUser = null
let currentProfile = null
let isLive = false
let currentLocation = { lat: 0, lng: 0 }

/**
 * Haversine formula (Still kept for client-side distance display if needed, 
 * but discovery filtering happens in Postgres RPC)
 */
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
        currentUser = data.user
        await dataService.fetchProfile()
        return data
    },

    logout: async () => {
        const { error } = await supabase.auth.signOut()
        if (error) throw error
        currentUser = null
        currentProfile = null
        isLive = false
    },

    checkSession: async () => {
        const { data: { session } } = await supabase.auth.getSession()
        currentUser = session?.user || null
        if (currentUser) await dataService.fetchProfile()
        return currentUser
    },

    // --- PROFILE MANAGEMENT ---
    fetchProfile: async () => {
        if (!currentUser) return null
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', currentUser.id)
            .single()

        if (data) currentProfile = data

        const { data: avail } = await supabase
            .from('availability')
            .select('is_available')
            .eq('user_id', currentUser.id)
            .single()

        if (avail) isLive = avail.is_available

        // Fetch current location
        const { data: loc } = await supabase
            .from('locations')
            .select('latitude, longitude')
            .eq('user_id', currentUser.id)
            .single()

        if (loc) currentLocation = { lat: loc.latitude, lng: loc.longitude }
        else currentLocation = { lat: 0, lng: 0 }

        return currentProfile
    },

    getCurrentUser: () => {
        if (!currentUser) return null
        return {
            id: currentUser.id,
            name: currentProfile?.full_name || currentUser.email.split('@')[0],
            initials: (currentProfile?.full_name || currentUser.email).substring(0, 2).toUpperCase(),
            avatar_url: currentProfile?.avatar_url,
            role: currentProfile?.role || 'Member',
            bio: currentProfile?.bio || 'SkillOGeo Professional',
            interests: currentProfile?.interests || [],
            phone: currentProfile?.phone,
            icon: '👤',
            lat: currentLocation.lat,
            lng: currentLocation.lng
        }
    },

    getUserById: async (id) => {
        const { data } = await supabase.from('profiles').select('*').eq('id', id).single()
        return data
    },

    updateProfile: async (updates) => {
        if (!currentUser) return null;
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
            .eq('id', currentUser.id);

        if (error) throw error;
        await dataService.fetchProfile();
        return currentProfile;
    },

    uploadAvatar: async (file) => {
        if (!currentUser) return null;
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
                    .eq('id', currentUser.id);
                if (currentProfile) currentProfile.avatar_url = data.secure_url;
                return data.secure_url;
            }
            throw new Error(data.error?.message || 'Upload failed');
        } catch (err) {
            console.error('Cloudinary Error:', err);
            throw err;
        }
    },

    // --- REALTIME & DISCOVERY ---
    setAvailability: async (status) => {
        if (!currentUser) return false
        const { error } = await supabase
            .from('availability')
            .update({ is_available: status, last_active_at: new Date().toISOString() })
            .eq('user_id', currentUser.id)

        if (!error) isLive = status
        return isLive;
    },

    getAvailability: () => isLive,

    setUserLocation: async (lat, lng) => {
        if (!currentUser) return

        currentLocation = { lat, lng } // Update local state immediately

        await supabase
            .from('locations')
            .update({ latitude: lat, longitude: lng, updated_at: new Date().toISOString() })
            .eq('user_id', currentUser.id)
    },

    /**
     * DISCOVERY (Backend Radius Logic)
     * No polling, no client-side filtering. 
     * Uses Postgres RPC to scale.
     */
    getNearbyUsers: async (searchTerm = '') => {
        if (!isLive || !currentUser) return [];

        // 1. Get my current location from database
        const { data: myLoc } = await supabase
            .from('locations')
            .select('latitude, longitude')
            .eq('user_id', currentUser.id)
            .single()

        if (!myLoc) return []

        // 2. Call Postgres function for distance-restricted search
        const { data: nearby, error } = await supabase.rpc('get_nearby_users', {
            my_lat: myLoc.latitude,
            my_lng: myLoc.longitude,
            radius_km: 5.0,
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
        if (!currentUser) return null;
        const { data, error } = await supabase
            .from('messages')
            .insert([{ sender_id: currentUser.id, receiver_id: receiverId, content: content }]);
        if (error) throw error;
        return data;
    },

    getMessages: async (otherUserId) => {
        if (!currentUser) return [];
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${currentUser.id})`)
            .order('created_at', { ascending: true });
        if (error) throw error;
        return data;
    },

    subscribeToMessages: (callback) => {
        if (!currentUser) return null;
        return supabase
            .channel('public:messages')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: `receiver_id=eq.${currentUser.id}`
            }, (payload) => callback(payload.new))
            .subscribe();
    }
}
