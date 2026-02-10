import './style.css'
import { dataService } from './services/dataService'
import { presenceSync } from './sync/presenceSync'

// 1. Frontend Layer: UI Only
// Role: Render map, markers, and UI components. 

const app = document.querySelector('#app')
let map = null
let myMarker = null
let networkMarkers = {}

const html = (strings, ...values) => {
  return strings.reduce((acc, str, i) => {
    return acc + str + (values[i] || '')
  }, '')
}



async function boot() {
  const user = await dataService.checkSession()
  if (user) {
    renderMainApp()
  } else {
    renderAuth()
  }
}

function renderAuth() {
  app.innerHTML = html`
    <div class="auth-container">
      <div class="auth-overlay"></div>
      <div class="auth-sidebar">
        <div class="logo" style="color: white;">
          <div class="logo-icon">S</div>
          SkillOGeo
        </div>
        <h1 style="font-size: 56px; line-height: 1.1; margin-bottom: 24px;">See your world,<br>find your people.</h1>
        <p style="font-size: 18px; color: rgba(255,255,255,0.8); max-width: 440px; margin-bottom: 32px;">
          The real-time networking platform that bridges the gap between digital interaction and real-world connection.
        </p>
      </div>
      <div class="auth-content">
        <div id="auth-form-container" style="max-width: 400px; width: 100%; margin: 0 auto;">
          <!-- Content injected by toggleAuthMode -->
        </div>
      </div>
    </div>
  `
  toggleAuthMode('login')
}

function toggleAuthMode(mode) {
  const container = document.getElementById('auth-form-container')
  const isLogin = mode === 'login'

  container.innerHTML = html`
    <h2 style="font-size: 32px; margin-bottom: 12px;">${isLogin ? 'Welcome back' : 'Create account'}</h2>
    <p style="color: #666; margin-bottom: 40px;">${isLogin ? 'Simple Real-time Networking.' : 'Join the real-time network.'}</p>
    
    ${!isLogin ? html`
    <div style="margin-bottom: 20px;">
      <label style="display: block; font-size: 14px; font-weight: 500; margin-bottom: 8px;">Full Name</label>
      <input type="text" id="auth-name" placeholder="John Doe" style="width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 16px;">
    </div>
    ` : ''}

    <div style="margin-bottom: 20px;">
      <label style="display: block; font-size: 14px; font-weight: 500; margin-bottom: 8px;">Email Address</label>
      <input type="email" id="auth-email" placeholder="email@example.com" style="width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 16px; color: #333; background: white;">
    </div>
    
    <div style="margin-bottom: 24px;">
      <label style="display: block; font-size: 14px; font-weight: 500; margin-bottom: 8px;">Password</label>
      <input type="password" id="auth-password" placeholder="••••••••" style="width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 16px; color: #333; background: white;">
    </div>

    <div id="auth-error" style="color: #ff4d4d; font-size: 14px; margin-bottom: 16px; display: none;"></div>

    <button type="button" class="btn-primary" id="btn-auth-submit" style="width: 100%; padding: 14px; font-size: 16px; margin-bottom: 16px;">
      ${isLogin ? 'Log In' : 'Sign Up'}
    </button>
    
    <p style="text-align: center; font-size: 14px; color: #666;">
      ${isLogin ? "Don't have an account?" : "Already have an account?"} 
      <a href="#" id="auth-toggle-btn" style="color: var(--primary); font-weight: 600; text-decoration: none;">
        ${isLogin ? 'Sign Up' : 'Log In'}
      </a>
    </p>
  `

  document.getElementById('auth-toggle-btn').onclick = (e) => {
    e.preventDefault()
    toggleAuthMode(isLogin ? 'signup' : 'login')
  }

  document.getElementById('btn-auth-submit').onclick = async () => {
    const email = document.getElementById('auth-email').value
    const password = document.getElementById('auth-password').value
    const fullName = !isLogin ? document.getElementById('auth-name').value : ''
    const errorEl = document.getElementById('auth-error')
    const btn = document.getElementById('btn-auth-submit')

    if (!email || !password || (!isLogin && !fullName)) {
      errorEl.innerText = "Please fill in all fields"
      errorEl.style.display = 'block'
      return
    }

    btn.disabled = true
    btn.innerText = 'Processing...'
    errorEl.style.display = 'none'

    try {
      if (isLogin) {
        await dataService.login(email, password)
      } else {
        await dataService.signUp(email, password, fullName)
        alert('Check your email for verification link!')
        return toggleAuthMode('login')
      }
      renderMainApp()
    } catch (err) {
      errorEl.innerText = err.message
      errorEl.style.display = 'block'
    } finally {
      btn.disabled = false
      btn.innerText = isLogin ? 'Log In' : 'Sign Up'
    }
  }
}

async function renderMainApp() {
  const user = dataService.getCurrentUser()
  const isLive = dataService.getAvailability()

  if (!user) return renderAuth()

  app.innerHTML = html`
    <div class="main-layout" style="display: flex; width: 100%; height: 100%;">
      <aside class="sidebar glass" id="sidebar" style="width: 320px; display: flex; flex-direction: column; border-radius: 0; z-index: 100;">
        <div class="sidebar-header" style="padding: 24px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div class="logo">
              <div class="logo-icon">S</div>
              SkillOGeo
            </div>
            <button id="btn-logout" style="background: none; border: none; cursor: pointer; opacity: 0.6; padding: 4px;">🚪</button>
          </div>
          
          <div style="margin: 24px 0; padding: 20px; background: rgba(255,255,255,0.03); border-radius: 16px; border: 1px solid var(--border-color);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <span style="font-weight: 600; font-size: 14px;">Go Live</span>
              <label class="switch">
                <input type="checkbox" id="live-toggle" ${isLive ? 'checked' : ''}>
                <span class="slider"></span>
              </label>
            </div>
            <p style="font-size: 12px; color: var(--text-muted);">When ON, you appear on the map for others nearby.</p>
          </div>

          <h3 style="margin-bottom: 10px; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted);">Nearby Now</h3>
        </div>
        
        <!-- Scrollable List Container -->
        <div id="nearby-scroll-container" style="flex: 1; overflow-y: auto; padding: 0 24px 24px 24px; -webkit-overflow-scrolling: touch;">
          <div id="nearby-list" style="display: flex; flex-direction: column; gap: 12px;">
            <!-- Dynamic list -->
          </div>
        </div>
        
        <div id="sidebar-footer" style="margin-top: auto; padding: 20px; border-top: 1px solid var(--border-color); display: flex; align-items: center; gap: 12px; flex-shrink: 0; background: var(--bg-color);">
          <div id="avatar-container" style="position: relative; cursor: pointer;">
            <div style="width: 44px; height: 44px; border-radius: 12px; background: var(--accent); display: flex; align-items: center; justify-content: center; font-weight: bold; border: 2px solid rgba(255,255,255,0.2); text-transform: uppercase; overflow: hidden;">
              ${user.avatar_url ? `<img src="${user.avatar_url}" style="width: 100%; height: 100%; object-fit: cover;">` : user.initials}
            </div>
            <div style="position: absolute; bottom: -4px; right: -4px; width: 20px; height: 20px; background: var(--primary); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; border: 2px solid var(--bg-color);">+</div>
            <input type="file" id="avatar-input" accept="image/*" style="display: none;">
          </div>
          <div style="flex: 1; overflow: hidden;" id="current-user-status">
            <!-- Dynamic status -->
          </div>
          <button id="btn-edit-profile" style="background: none; border: none; cursor: pointer; font-size: 18px; padding: 4px;">⚙️</button>
        </div>
      </aside>
      
      <!-- Floating Edit Button for Mobile -->
      <button id="btn-edit-profile-mobile" style="display: none; position: fixed; bottom: 200px; right: 20px; width: 56px; height: 56px; border-radius: 50%; background: var(--primary); border: none; color: white; font-size: 24px; box-shadow: 0 4px 12px rgba(0,122,255,0.4); cursor: pointer; z-index: 5000;">⚙️</button>
      
      <!-- AI Chat Button -->
      <button id="btn-ai-chat" style="position: fixed; bottom: 20px; right: 20px; width: 60px; height: 60px; border-radius: 50%; background: linear-gradient(135deg, #6366f1, #a855f7); border: none; color: white; font-size: 30px; box-shadow: 0 4px 16px rgba(168, 85, 247, 0.4); cursor: pointer; z-index: 5000; display: flex; align-items: center; justify-content: center; transition: transform 0.2s;">
        🤖
      </button>
      
      <main style="flex: 1; position: relative; background: #1a1a1a;">
         <div id="map"></div>
      </main>
    </div>
    
    <!-- Modal OUTSIDE map container -->
    <div id="modal-container" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(8px); z-index: 10000; align-items: center; justify-content: center;"></div>
  `

  initMap()

  // Mobile edit profile button - Attach ASAP
  document.getElementById('btn-edit-profile-mobile')?.addEventListener('click', () => renderEditProfile())

  // Subscribe to Bridge events (UI re-render)
  presenceSync.on('network-update', async () => {
    const isLive = dataService.getAvailability()
    await updateMarkers(isLive)
    // updateStatusUI(isLive) - handled by subscription now
    await updateNearbyList(isLive)
  })

  // Subscribe to Profile & Status Changes (Single Source of Truth)
  dataService.subscribe((user, isLive) => {
    updateStatusUI(isLive, user)
    updateAvatarUI(user)
    // IMPORTANT: Also update markers because my avatar/name might have changed
    // and I appear on the map as 'You' (myMarker)
    updateMarkers(isLive)
  })

  // Re-center map when location updates
  presenceSync.on('location-updated', ({ latitude, longitude }) => {
    if (map) {
      map.setView([latitude, longitude], map.getZoom())
    }
  })

  document.getElementById('live-toggle').addEventListener('change', async (e) => {
    const isChecked = e.target.checked

    if (isChecked) {
      requestLocationPermission(async () => {
        const status = await dataService.setAvailability(true)
        if (status) {
          presenceSync.startLiveFeed()
          presenceSync.startLocationTracking()
        } else {
          e.target.checked = false // Revert if failed
        }
        presenceSync.emit('network-update')
      })
    } else {
      await dataService.setAvailability(false)
      presenceSync.stopLiveFeed()
      presenceSync.stopLocationTracking()
      presenceSync.emit('network-update')
    }
  })

  document.getElementById('avatar-container').onclick = () => {
    document.getElementById('avatar-input').click()
  }

  document.getElementById('avatar-input').onchange = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    const container = document.getElementById('avatar-container')
    const originalContent = container.innerHTML
    container.innerHTML = `<div style="width: 44px; height: 44px; border-radius: 12px; background: #222; display: flex; align-items: center; justify-content: center;"><div class="loader-tiny"></div></div>`

    try {
      await dataService.uploadAvatar(file)
      // renderMainApp() // Removed - handled by subscription
    } catch (err) {
      alert('Upload failed: ' + err.message)
      container.innerHTML = originalContent
    }
  }

  document.getElementById('btn-logout').onclick = async () => {
    if (confirm('Are you sure you want to log out?')) {
      await dataService.setAvailability(false) // Safe exit
      await dataService.logout()
      presenceSync.stopLiveFeed()
      presenceSync.stopLocationTracking()
      renderAuth()
    }
  }

  document.getElementById('btn-edit-profile').onclick = () => renderEditProfile()

  // Message Subscription Removed

  // Initial update
  await updateNearbyList(isLive)
  await updateMarkers(isLive)
  // updateStatusUI(isLive) - handled by subscription

  // updateStatusUI(isLive) - handled by subscription

  // AI Chat Button
  const aiBtn = document.getElementById('btn-ai-chat')
  if (aiBtn) aiBtn.onclick = () => renderAIChat()
}

function requestLocationPermission(callback) {
  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        await dataService.setUserLocation(position.coords.latitude, position.coords.longitude)
        if (map) map.setView([position.coords.latitude, position.coords.longitude], 15)
        callback()
      },
      (error) => {
        console.warn("Location permission denied.");
        callback()
      }
    )
  } else {
    callback()
  }
}

function initMap() {
  const user = dataService.getCurrentUser()
  if (!user) return

  if (map) {
    map.remove()
  }

  map = L.map('map', {
    zoomControl: false,
    attributionControl: false
  }).setView([user.lat, user.lng], 15)

  // Google Maps-style with beige roads
  L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 19
    }
  ).addTo(map)

  const createZoomBtn = (label, top, onClick) => {
    const btn = document.createElement('div')
    btn.className = 'glass'
    btn.style = `position: absolute; top: ${top}px; right: 20px; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 1000; font-weight: bold; font-size: 20px;`
    btn.innerHTML = label
    btn.onclick = onClick
    return btn
  }

  const main = document.querySelector('main')
  main.appendChild(createZoomBtn('+', 20, () => map.zoomIn()))
  main.appendChild(createZoomBtn('-', 72, () => map.zoomOut()))
}

async function updateMarkers(isLive) {
  if (!map) return

  const user = dataService.getCurrentUser()

  if (!isLive) {
    // Clear everything if not live
    Object.values(networkMarkers).forEach(m => m.remove())
    networkMarkers = {}
    if (myMarker) {
      myMarker.remove()
      myMarker = null
    }
    return
  }

  // --- RECONCILE "YOU" MARKER ---
  const youIcon = L.divIcon({
    className: 'custom-marker',
    html: `<div class="marker-inner you"><div class="pulse"></div>${user.avatar_url ? `<div style="width: 100%; height: 100%; overflow: hidden; border-radius: 50%;"><img src="${user.avatar_url}" style="width: 100%; height: 100%; object-fit: cover;"></div>` : `<span>${user.icon}</span>`}<div class="marker-label">You</div></div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 40]
  })

  if (!myMarker) {
    myMarker = L.marker([user.lat, user.lng], { icon: youIcon }).addTo(map)
  } else {
    myMarker.setLatLng([user.lat, user.lng])
    myMarker.setIcon(youIcon)
  }

  // --- RECONCILE NEARBY USERS ---
  const nearby = await dataService.getNearbyUsers()
  const fetchedIds = new Set(nearby.map(u => u.id))

  // 1. Remove users who are no longer nearby
  Object.keys(networkMarkers).forEach(id => {
    if (!fetchedIds.has(id)) {
      networkMarkers[id].remove()
      delete networkMarkers[id]
    }
  })

  // 2. Add or Update existing users
  nearby.forEach(u => {
    const icon = L.divIcon({
      className: 'custom-marker',
      html: `<div class="marker-inner">${u.avatar_url ? `<div style="width: 100%; height: 100%; overflow: hidden; border-radius: 50%;"><img src="${u.avatar_url}" style="width: 100%; height: 100%; object-fit: cover;"></div>` : `<span>${u.icon}</span>`}<div class="marker-label">${u.name}</div></div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 32]
    })

    if (networkMarkers[u.id]) {
      // Update existing marker
      networkMarkers[u.id].setLatLng([u.lat, u.lng])
      networkMarkers[u.id].setIcon(icon)
    } else {
      // Add new marker
      const marker = L.marker([u.lat, u.lng], { icon }).addTo(map)
      marker.on('click', () => showProfile(u))
      networkMarkers[u.id] = marker
    }
  })
}

function updateStatusUI(isLive, user = null) {
  if (!user) user = dataService.getCurrentUser()
  const statusEl = document.getElementById('current-user-status')
  if (!statusEl || !user) return

  statusEl.innerHTML = html`
    <div style="font-weight: 600; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px;">${user.name}</div>
    <div style="font-size: 12px; color: ${isLive ? '#4ade80' : 'var(--text-muted)'};">
       ${isLive ? '● Live' : 'Offline'}
    </div>
  `
}

function updateAvatarUI(user) {
  if (!user) return
  const container = document.getElementById('avatar-container')
  if (!container) return

  // Keep the overlay + button, just update the image/initials
  container.innerHTML = `
    <div style="width: 44px; height: 44px; border-radius: 12px; background: var(--accent); display: flex; align-items: center; justify-content: center; font-weight: bold; border: 2px solid rgba(255,255,255,0.2); text-transform: uppercase; overflow: hidden;">
      ${user.avatar_url ? `<img src="${user.avatar_url}" style="width: 100%; height: 100%; object-fit: cover;">` : user.initials}
    </div>
    <div style="position: absolute; bottom: -4px; right: -4px; width: 20px; height: 20px; background: var(--primary); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; border: 2px solid var(--bg-color);">+</div>
    <input type="file" id="avatar-input" accept="image/*" style="display: none;">
  `
  // Re-attach listener since we replaced innerHTML
  document.getElementById('avatar-input').onchange = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    const container = document.getElementById('avatar-container')
    const originalContent = container.innerHTML
    container.innerHTML = `<div style="width: 44px; height: 44px; border-radius: 12px; background: #222; display: flex; align-items: center; justify-content: center;"><div class="loader-tiny"></div></div>`

    try {
      await dataService.uploadAvatar(file)
      // UI update happens via subscription automatically
    } catch (err) {
      alert('Upload failed: ' + err.message)
      container.innerHTML = originalContent
    }
  }
}

/**
 * 4. Helper Functions
 */
function toggleMapInteraction(enable) {
  const mapContainer = document.getElementById('map')
  if (mapContainer) {
    mapContainer.style.pointerEvents = enable ? 'auto' : 'none'
  }
}

async function updateNearbyList(live, filter = '') {
  const container = document.getElementById('nearby-list')
  if (!container) return

  if (!live) {
    container.innerHTML = `
      <div style="flex: 1; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 14px; text-align: center; padding: 20px;">
        Go Live to see who's nearby
      </div>
    `
    return
  }

  // Create search bar if not exists
  if (!document.getElementById('nearby-search')) {
    const header = document.querySelector('.sidebar-header'); // Fixed header
    if (header) {
      const searchContainer = document.createElement('div');
      searchContainer.style.marginTop = '10px';
      searchContainer.innerHTML = `
          <input type="text" id="nearby-search" placeholder="Search profession, interest..." 
          class="glass" style="width: 100%; border: 1px solid var(--border-color); color: white; padding: 10px; border-radius: 8px; font-size: 13px;">
        `;
      header.appendChild(searchContainer);

      document.getElementById('nearby-search').addEventListener('input', (e) => {
        updateNearbyList(true, e.target.value);
      });
    }
  }

  const users = await dataService.getNearbyUsers(filter)


  container.innerHTML = users.length ? users.map(u => html`
    <div class="user-item glass" onclick="window.showProfileById('${u.id}')" style="padding: 12px; display: flex; align-items: center; gap: 12px; cursor: pointer;">
      <div style="width: 40px; height: 40px; border-radius: 10px; background: var(--primary); display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px; text-transform: uppercase; overflow: hidden;">
        ${u.avatar_url ? `<img src="${u.avatar_url}" style="width: 100%; height: 100%; object-fit: cover;">` : u.initials}
      </div>
      <div style="flex: 1; overflow: hidden;">
        <div style="font-weight: 600; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${u.name}</div>
        <div style="font-size: 11px; color: var(--text-muted);">${u.role}</div>
      </div>
      <div style="font-size: 10px; color: #4ade80; font-weight: bold;">LIVE</div>
    </div>
  `).join('') : `<div style="text-align: center; color: var(--text-muted); padding: 20px;">No users found</div>`
}

window.showProfileById = async (id) => {
  const user = await dataService.getUserById(id)
  if (user) showProfile({
    ...user,
    name: user.full_name,
    distance: 'Nearby',
    initials: (user.full_name || 'Anonymous').substring(0, 2).toUpperCase(),
    bio: user.bio || 'SkillOGeo Professional',
    interests: user.interests || ['Networking'],
    phone: user.phone
  })
}

function showProfile(user) {
  const modal = document.getElementById('modal-container')
  modal.style.display = 'flex'
  toggleMapInteraction(false)

  modal.innerHTML = html`
    <div class="profile-card glass" style="width: 100%; max-width: 400px; background: #1e2229; border-radius: 24px; overflow: hidden; border: 1px solid var(--border-color);">
      <div style="height: 100px; background: linear-gradient(135deg, var(--primary), var(--accent)); display: flex; justify-content: flex-end; padding: 15px;">
         <button id="close-modal" style="background: rgba(0,0,0,0.2); border: none; color: white; width: 30px; height: 30px; border-radius: 50%; cursor: pointer;">✕</button>
      </div>
      
      <div style="padding: 0 30px 30px;">
        <div style="margin-top: -40px;">
          <div style="width: 80px; height: 80px; border-radius: 20px; background: #2d333b; border: 4px solid #1e2229; display: flex; align-items: center; justify-content: center; font-size: 28px; position: relative; text-transform: uppercase; overflow: hidden;">
            ${user.avatar_url ? `<img src="${user.avatar_url}" style="width: 100%; height: 100%; object-fit: cover;">` : user.initials}
            <div style="position: absolute; bottom: -2px; right: -2px; width: 14px; height: 14px; background: #4ade80; border: 2px solid #1e2229; border-radius: 50%;"></div>
          </div>
        </div>
        
        <div style="margin-top: 20px;">
          <h2 style="font-size: 24px; color: white;">${user.name}</h2>
          <div style="color: var(--text-muted); font-size: 14px; margin-top: 4px;">${user.role} • ${user.distance}</div>
        </div>
        
        <p style="margin-top: 20px; color: #adbac7; font-size: 14px; line-height: 1.6;">${user.bio}</p>
        
        <div style="margin-top: 20px; display: flex; flex-wrap: wrap; gap: 8px;">
          ${(user.interests || []).map(i => `<span style="background: rgba(0,122,255,0.1); color: var(--primary); padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 500;">${i}</span>`).join('')}
        </div>
        
        <div style="margin-top: 30px; display: flex; flex-direction: column; gap: 10px;">
          ${user.phone ? `
          <a href="tel:${user.phone}" class="btn-primary" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 10px; height: 50px; text-decoration: none; background: #22c55e;">
            <span>📞</span> CALL DIRECTLY
          </a>
          <a href="https://wa.me/${user.phone.replace(/[^0-9]/g, '')}" target="_blank" class="btn-primary" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 10px; height: 50px; text-decoration: none; background: #25D366;">
            <span>💬</span> WHATSAPP
          </a>
          ` : `
          <div style="text-align: center; color: var(--text-muted); font-size: 13px; padding: 10px; border: 1px dashed var(--border-color); border-radius: 8px;">
            No contact info available
          </div>
          `}
        </div>
      </div>
    </div>
  `

  document.getElementById('close-modal').onclick = () => {
    modal.style.display = 'none'
    toggleMapInteraction(true)
  }
}

function renderEditProfile() {
  const user = dataService.getCurrentUser()
  const modal = document.getElementById('modal-container')
  modal.style.display = 'flex'
  toggleMapInteraction(false)
  modal.dataset.chattingWith = '' // Clear chat state

  modal.innerHTML = html`
    <div class="glass" style="width: 100%; max-width: 450px; height: 90vh; max-height: 800px; display: flex; flex-direction: column; background: #1e2229; border-radius: 20px; border: 1px solid var(--border-color); overflow: hidden;">
      <!-- Fixed Header -->
      <div style="padding: 20px 24px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; background: #1e2229; z-index: 10;">
        <h2 style="font-size: 20px; margin: 0;">Edit Profile</h2>
        <button id="close-modal" style="background: none; border: none; color: white; cursor: pointer; font-size: 20px; padding: 5px;">✕</button>
      </div>

      <!-- Scrollable Content -->
      <div style="flex: 1; overflow-y: auto; padding: 24px;">
        <div style="margin-bottom: 20px;">
          <label style="display: block; font-size: 13px; color: var(--text-muted); margin-bottom: 8px;">Full Name</label>
          <input type="text" id="edit-name" value="${user.name}" class="glass" style="width: 100%; padding: 12px; border-radius: 8px; color: white;">
        </div>

        <div style="margin-bottom: 20px;">
          <label style="display: block; font-size: 13px; color: var(--text-muted); margin-bottom: 8px;">Role</label>
          <input type="text" id="edit-role" value="${user.role}" class="glass" style="width: 100%; padding: 12px; border-radius: 8px; color: white;">
        </div>

        <div style="margin-bottom: 20px;">
          <label style="display: block; font-size: 13px; color: var(--text-muted); margin-bottom: 8px;">Bio</label>
          <textarea id="edit-bio" class="glass" style="width: 100%; padding: 12px; border-radius: 8px; color: white; height: 80px; resize: none;">${user.bio}</textarea>
        </div>

        <div style="margin-bottom: 20px;">
          <label style="display: block; font-size: 13px; color: var(--text-muted); margin-bottom: 8px;">Interests (comma separated)</label>
          <input type="text" id="edit-interests" value="${user.interests.join(', ')}" class="glass" style="width: 100%; padding: 12px; border-radius: 8px; color: white;">
        </div>

        <div style="margin-bottom: 20px;">
          <label style="display: block; font-size: 13px; color: var(--text-muted); margin-bottom: 8px;">Phone Number</label>
          <input type="text" id="edit-phone" value="${user.phone || ''}" placeholder="+1234567890" class="glass" style="width: 100%; padding: 12px; border-radius: 8px; color: white;">
        </div>
      </div>

      <!-- Fixed Footer -->
      <div style="padding: 20px; border-top: 1px solid var(--border-color); background: #1e2229; z-index: 10;">
        <button id="save-profile" class="btn-primary" style="width: 100%; height: 50px; font-size: 16px; font-weight: 600;">SAVE CHANGES</button>
      </div>
    </div>
  `

  document.getElementById('close-modal').onclick = () => {
    modal.style.display = 'none'
    toggleMapInteraction(true)
  }
  document.getElementById('save-profile').onclick = async () => {
    const btn = document.getElementById('save-profile')
    btn.disabled = true
    btn.innerText = 'SAVING...'

    try {
      await dataService.updateProfile({
        name: document.getElementById('edit-name').value,
        role: document.getElementById('edit-role').value,
        bio: document.getElementById('edit-bio').value,
        phone: document.getElementById('edit-phone').value,
        interests: document.getElementById('edit-interests').value.split(',').map(i => i.trim()).filter(i => i)
      })
      modal.style.display = 'none'
      toggleMapInteraction(true)
      // Removed renderMainApp() - UI updates via subscription now
    } catch (err) {
      alert('Save failed: ' + err.message)
      btn.disabled = false
      btn.innerText = 'SAVE CHANGES'
    }
  }
}

async function renderChat(userId, userName) {
  const modal = document.getElementById('modal-container')
  modal.style.display = 'flex'
  toggleMapInteraction(false)
  modal.dataset.chattingWith = userId

  modal.innerHTML = html`
    <div class="glass" style="width: 100%; max-width: 400px; height: 500px; max-height: 80vh; background: #1e2229; border-radius: 20px; display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--border-color);">
      <div style="padding: 20px; background: rgba(0,122,255,0.1); display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color);">
        <div style="font-weight: 600;">Chat with ${userName}</div>
        <button id="close-modal" style="background: none; border: none; color: white; cursor: pointer;">✕</button>
      </div>
      
      <div id="chat-messages" style="flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 10px;">
        <div style="text-align: center; color: var(--text-muted); font-size: 12px;">Loading messages...</div>
      </div>

      <div style="padding: 15px; border-top: 1px solid var(--border-color); display: flex; gap: 10px;">
        <input type="text" id="chat-input" placeholder="Type a message..." class="glass" style="flex: 1; padding: 10px; border-radius: 20px; color: white; border: none;">
        <button id="send-msg" style="background: var(--primary); border: none; color: white; width: 40px; height: 40px; border-radius: 50%; cursor: pointer;">✈️</button>
      </div>
    </div>
  `

  document.getElementById('close-modal').onclick = () => {
    modal.style.display = 'none'
    toggleMapInteraction(true)
  }

  await renderChatMessages(userId)

  const send = async () => {
    const input = document.getElementById('chat-input')
    const content = input.value.trim()
    if (!content) return

    input.value = ''
    try {
      await dataService.sendMessage(userId, content)
      renderChatMessages(userId)
    } catch (err) {
      console.warn("Msg failed:", err)
    }
  }

  document.getElementById('send-msg').onclick = send
  document.getElementById('chat-input').onkeypress = (e) => {
    if (e.key === 'Enter') send()
  }
}

async function renderChatMessages(otherUserId) {
  const container = document.getElementById('chat-messages')
  if (!container) return

  const messages = await dataService.getMessages(otherUserId)
  const myId = dataService.getCurrentUser().id

  container.innerHTML = messages.map(m => {
    const isMe = m.sender_id === myId
    return html`
      <div style="align-self: ${isMe ? 'flex-end' : 'flex-start'}; background: ${isMe ? 'var(--primary)' : 'rgba(255,255,255,0.05)'}; padding: 8px 12px; border-radius: 15px; max-width: 80%; font-size: 14px; position: relative;">
        ${m.content}
        <div style="font-size: 8px; opacity: 0.5; margin-top: 4px; text-align: right;">${new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
      </div>
    `
  }).join('')

  container.scrollTop = container.scrollHeight
}





// Offline Bot - Fallback when N8N is unavailable
function getOfflineResponse(userMessage) {
  const msg = userMessage.toLowerCase()

  // Help & About
  if (msg.includes('help') || msg.includes('what') || msg.includes('how')) {
    return "I'm SkillOGeo AI! I can help you navigate the map and find skilled professionals nearby. Try asking me about how to use the app, or search for specific skills!"
  }

  // Map usage
  if (msg.includes('map') || msg.includes('find') || msg.includes('search')) {
    return "To find people on the map:\n\n1. Toggle 'Go Live' to appear on the map\n2. Use the search bar to filter by profession or interest\n3. Click on any marker to view profiles\n4. Start chatting with nearby users!"
  }

  // Profile
  if (msg.includes('profile') || msg.includes('edit')) {
    return "You can edit your profile by clicking the ⚙️ settings button at the bottom of the sidebar (or the floating button on mobile). Add your skills, interests, and bio to help others find you!"
  }

  // Privacy
  if (msg.includes('privacy') || msg.includes('safe') || msg.includes('data')) {
    return "Your location is only shared when you toggle 'Go Live'. You can turn it off anytime to disappear from the map. We use Supabase for secure data storage."
  }

  // Greeting
  if (msg.includes('hi') || msg.includes('hello') || msg.includes('hey')) {
    return "Hey there! 👋 I'm currently in offline mode, but I can still help with basic questions about SkillOGeo. What would you like to know?"
  }

  // Default
  return "I'm currently in offline mode and can only answer basic questions. For advanced AI assistance, please check your N8N connection. You can ask me about:\n\n• How to use the map\n• Editing your profile\n• Privacy & safety"
}

// ... existing functions ...

async function renderAIChat() {
  const modal = document.getElementById('modal-container')
  modal.style.display = 'flex'
  toggleMapInteraction(false)

  // Chat History (Session based)
  if (!window.aiChatHistory) window.aiChatHistory = []

  modal.innerHTML = html`
    <div class="glass ai-chat-modal" style="width: 100%; max-width: 400px; height: 600px; max-height: 80vh; background: #1e2229; border-radius: 20px; display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--border-color);">
      
      <!-- Header -->
      <div style="padding: 20px; background: linear-gradient(135deg, #6366f1, #a855f7); display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="font-size: 24px;">🧠</div>
          <div>
            <div style="font-weight: 700; font-size: 16px;">AI Assistant</div>
            <div style="font-size: 11px; opacity: 0.8;">Powered by Backboard.io</div>
          </div>
        </div>
        <button id="close-modal" style="background: rgba(0,0,0,0.2); border: none; color: white; width: 30px; height: 30px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center;">✕</button>
      </div>
      
      <!-- Messages Area -->
      <div id="ai-chat-messages" style="flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 12px; background: #13161c;">
        ${window.aiChatHistory.length === 0 ? `
          <div style="text-align: center; color: var(--text-muted); margin-top: 40px;">
            <div style="font-size: 40px; margin-bottom: 10px;">👋</div>
            <p>Hi! I'm your AI assistant.</p>
            <p style="font-size: 12px;">Ask me anything about the map or community!</p>
          </div>
        ` : window.aiChatHistory.map(m => `
          <div style="align-self: ${m.role === 'user' ? 'flex-end' : 'flex-start'}; max-width: 80%;">
            <div style="background: ${m.role === 'user' ? 'var(--primary)' : '#2d333b'}; padding: 10px 14px; border-radius: 16px; border-bottom-${m.role === 'user' ? 'right' : 'left'}-radius: 4px; font-size: 14px; line-height: 1.5; color: ${m.role === 'user' ? 'white' : '#e2e8f0'}; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              ${m.content}
            </div>
          </div>
        `).join('')}
      </div>

      <!-- Input Area -->
      <div style="padding: 16px; background: #1e2229; border-top: 1px solid var(--border-color);">
        <div class="glass" style="display: flex; gap: 8px; padding: 8px; border-radius: 24px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);">
          <input type="text" id="ai-chat-input" placeholder="Type a message..." style="flex: 1; background: none; border: none; color: white; padding: 0 12px; font-size: 14px; outline: none;">
          <button id="ai-send-btn" style="width: 36px; height: 36px; border-radius: 50%; background: var(--primary); border: none; color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;">
            <span style="font-size: 16px;">➤</span>
          </button>
        </div>
      </div>

    </div>
  `

  const messagesContainer = document.getElementById('ai-chat-messages')
  const input = document.getElementById('ai-chat-input')
  const sendBtn = document.getElementById('ai-send-btn')

  // Scroll to bottom
  messagesContainer.scrollTop = messagesContainer.scrollHeight

  document.getElementById('close-modal').onclick = () => {
    modal.style.display = 'none'
    toggleMapInteraction(true)
  }

  const sendMessage = async () => {
    const text = input.value.trim()
    if (!text) return

    // Clear input immediately
    input.value = ''

    // Add User Message
    window.aiChatHistory.push({ role: 'user', content: text })

    let reply = "I didn't quite get that. 🤔"
    let isOnline = false

    try {
      // Recursive function to handle tool calls
      const processAI = async (payload) => {
        const response = await fetch('/api/backboard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || data.message || 'API Error')
        }

        if (data.status === 'requires_action') {
          console.log('AI requested tools:', data.tool_calls)

          // Execute tools client-side (mock for now, or actual implementation)
          const toolOutputs = data.tool_calls.map(tc => {
            const args = JSON.parse(tc.function.arguments || '{}')
            console.log(`Executing tool: ${tc.function.name}`, args)

            let result = { status: "success", message: "Tool executed" }

            // Example Tool Implementations
            if (tc.function.name === 'zoom_map') {
              if (map) map.setZoom(args.level || 15)
              result = { status: "success", zoom: map ? map.getZoom() : 0 }
            } else if (tc.function.name === 'get_my_location') {
              const user = dataService.getCurrentUser()
              result = { lat: user.lat, lng: user.lng }
            }

            return {
              tool_call_id: tc.id,
              output: JSON.stringify(result)
            }
          })

          // Recursive call with tool outputs
          return processAI({
            threadId: data.threadId,
            runId: data.runId,
            toolOutputs
          })
        }

        return data
      }

      // Initial Call
      const finalData = await processAI({
        message: text,
        threadId: window.aiThreadId || null
      })

      console.log('Final AI Response:', finalData)

      if (finalData.reply) {
        reply = finalData.reply
        isOnline = true
        if (finalData.threadId) window.aiThreadId = finalData.threadId
      }

    } catch (err) {
      console.error('AI Error:', err)
      const errorMsg = err.message
      reply = `${getOfflineResponse(text)}\n\n<span style="color: #ef4444; font-size: 10px;">Debug: ${errorMsg}</span>`
    }

    // Add status indicator
    const statusEmoji = isOnline ? '🟢' : '🔴'
    const statusText = isOnline ? 'Online AI' : 'Offline Mode'
    const finalReply = `${reply}\n\n<span style="font-size: 10px; opacity: 0.5;">${statusEmoji} ${statusText}</span>`

    window.aiChatHistory.push({ role: 'assistant', content: finalReply })
    renderAIChat() // Re-render with both messages
  }

  sendBtn.onclick = sendMessage
  // Bind enter key
  input.onkeypress = (e) => {
    if (e.key === 'Enter') sendMessage()
  }

  // Focus input
  input.focus()
}

boot()
presenceSync.init()
