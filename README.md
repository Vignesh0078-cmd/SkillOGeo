# SkillOGeo - Real-Time Professional Networking Map

SkillOGeo connects you with professionals and skilled individuals right in your vicinity. Whether you need a developer, a doctor, a plumber, or just want to network with like-minded people, SkillOGeo shows you who is nearby and available to connect instantly.

## 🚀 Key Features

*   **Real-Time Live Location**: See professionals move on the map in real-time. markers update instantly as users move.
*   **Smart Radius Discovery**: Efficiently finds people within a 5km radius using backend geospatial queries (PostGIS capabilities).
*   **Instant Availability Toggle**: "Go Live" to become visible to others; go offline for privacy.
*   **Professional Search**: Filter the map by role (e.g., "Driver"), interests ("AI", "Music"), or bio keywords.
*   **Direct Contact**: Call or WhatsApp professionals directly from their profile card.
*   **Rich Profiles**: Customizable profiles with roles, bios, interests, and Cloudinary-powered avatars.

## 🛠 Tech Stack

*   **Frontend**: React (Vite), Vanilla CSS (Glassmorphism UI), Leaflet.js (Map)
*   **Backend**: Supabase (PostgreSQL, Realtime Subscriptions, RPC Functions, RLS Security)
*   **Storage**: Cloudinary (Optimized Image Delivery)
*   **Deployment**: Vercel

## ⚡ Deployment

### Prerequisites

1.  **Supabase Project**: Create a project and run the `schema.sql` script in the SQL editor.
2.  **Cloudinary Account**: Get your Cloud Name and Unsigned Upload Preset.

### Environment Variables

Create a `.env` file in the root directory (or configure in Vercel):

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_CLOUDINARY_CLOUD_NAME=your_cloud_name
VITE_CLOUDINARY_API_KEY=your_api_key
VITE_CLOUDINARY_API_SECRET=your_api_secret
BACKBOARD_API_KEY=your_backboard_ai_key
BACKBOARD_ASSISTANT_ID=your_assistant_id
```

### Run Locally

```bash
git clone https://github.com/your-username/skillogeo.git
cd skillogeo
npm install
npm run dev
```

## 📱 Mobile Experience

SkillOGeo is designed as a Progressive Web App (PWA) friendly interface. It works best on mobile devices with GPS enabled.

---

**Built for the DEVSOC2026**
