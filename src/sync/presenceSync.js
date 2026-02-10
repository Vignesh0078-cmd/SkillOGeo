import { dataService } from '../services/dataService'
import { supabase } from '../supabase'

// 3. Realtime Sync Layer: Presence Synchronization (The Bridge)
// Role: Handle event relaying, simulated real-time streams, and location tracking coordination.

export const presenceSync = {
    _listeners: {},
    _feedInterval: null,
    _watchId: null,

    init: () => {
        console.log("Realtime Sync Bridge Initialized");

        // Handle app close/refresh to prevent ghost users
        window.addEventListener('beforeunload', () => {
            // Note: synchronous calls are limited here, but we can try a beacon or fire-and-forget
            // dataService.setAvailability(false) is async, so we use a non-blocking attempt
            const user = dataService.getCurrentUser();
            if (user) {
                // We can't await here, but many browsers will allow the request to start
                dataService.setAvailability(false);
            }
        });
    },

    // Event System
    on: (event, callback) => {
        if (!presenceSync._listeners[event]) presenceSync._listeners[event] = [];
        presenceSync._listeners[event].push(callback);
    },

    _lastEmit: {},
    emit: (event, data) => {
        // Throttle rapid updates for high-frequency events
        if (event === 'network-update') {
            const now = Date.now();
            if (presenceSync._lastEmit[event] && (now - presenceSync._lastEmit[event] < 800)) {
                return;
            }
            presenceSync._lastEmit[event] = now;
        }

        console.log(`Sync Bridge: Relaying event [${event}]`);
        if (presenceSync._listeners[event]) {
            presenceSync._listeners[event].forEach(cb => cb(data));
        }
    },

    // Location Tracking
    startLocationTracking: () => {
        if (presenceSync._watchId) return;

        console.log("Sync Bridge: Starting continuous location tracking...");
        if ("geolocation" in navigator) {
            presenceSync._watchId = navigator.geolocation.watchPosition(
                async (position) => {
                    const { latitude, longitude } = position.coords;
                    await dataService.setUserLocation(latitude, longitude);
                    // Heartbeat: keep user "online" as long as they are moving/active
                    await dataService.sendHeartbeat();
                    presenceSync.emit('location-updated', { latitude, longitude });
                },
                (error) => console.warn("WatchPosition error:", error),
                { enableHighAccuracy: true, maximumAge: 10000 }
            );

            // Backup Heartbeat (useful if location doesn't change)
            presenceSync._heartbeatInterval = setInterval(() => {
                dataService.sendHeartbeat();
            }, 60000); // Pulse every 1 min
        }
    },

    stopLocationTracking: () => {
        if (presenceSync._watchId !== null) {
            navigator.geolocation.clearWatch(presenceSync._watchId);
            presenceSync._watchId = null;
            console.log("Sync Bridge: Location tracking stopped.");
        }
        if (presenceSync._heartbeatInterval) {
            clearInterval(presenceSync._heartbeatInterval);
            presenceSync._heartbeatInterval = null;
        }
    },

    // Realtime Subscriptions
    startLiveFeed: () => {
        if (presenceSync._channel) return;

        console.log("Sync Bridge: Connecting to Supabase Realtime...");

        presenceSync._channel = supabase
            .channel('public:availability_locations')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'availability'
            }, () => {
                presenceSync.emit('network-update');
            })
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'locations'
            }, () => {
                presenceSync.emit('network-update');
            })
            .subscribe((status) => {
                console.log(`Sync Bridge: Subscription Status [${status}]`);
                if (status === 'SUBSCRIBED') {
                    console.log("Sync Bridge: ✅ Connected to Realtime for Availability & Locations");
                }
            });
    },

    stopLiveFeed: () => {
        if (presenceSync._channel) {
            supabase.removeChannel(presenceSync._channel);
            presenceSync._channel = null;
            console.log("Sync Bridge: Realtime subscriptions stopped.");
        }
    }
}
