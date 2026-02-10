-- 1. PROFILES TABLE
-- Stores static user information.
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  role TEXT,
  avatar_url TEXT,
  bio TEXT,
  interests TEXT[],
  phone TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. AVAILABILITY TABLE
-- Stores live intent and controls visibility.
CREATE TABLE availability (
  user_id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  is_available BOOLEAN DEFAULT FALSE,
  last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. LOCATIONS TABLE
-- Stores live position, updated only when available.
CREATE TABLE locations (
  user_id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. MESSAGES TABLE
-- Stores direct messages between users.
CREATE TABLE messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- POLICIES

-- Profiles: Anyone can read, only owner can update
CREATE POLICY "Public profiles are viewable by everyone" ON profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Availability: Anyone can read, only owner can update
CREATE POLICY "Availability is viewable by everyone" ON availability
  FOR SELECT USING (true);

CREATE POLICY "Users can update own availability" ON availability
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own availability" ON availability
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Locations: Anyone can read, only owner can update
CREATE POLICY "Locations are viewable by everyone" ON locations
  FOR SELECT USING (true);

CREATE POLICY "Users can update own location" ON locations
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own location" ON locations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Messages: Users can insert their own, read their own (sent or received)
CREATE POLICY "Users can send messages" ON messages
  FOR INSERT WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Users can read their own messages" ON messages
  FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);


-- FUNCTION: Trigger to create profile/availability/location on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (new.id, new.raw_user_meta_data->>'full_name');

  INSERT INTO public.availability (user_id, is_available)
  VALUES (new.id, false);

  INSERT INTO public.locations (user_id, latitude, longitude)
  VALUES (new.id, 0, 0);

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- RADIUS DISCOVERY FUNCTION (Backend filtering for scalability + Profession Search)
CREATE OR REPLACE FUNCTION get_nearby_users(
  my_lat DOUBLE PRECISION,
  my_lng DOUBLE PRECISION,
  radius_km DOUBLE PRECISION,
  search_term TEXT DEFAULT ''
)
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  role TEXT,
  avatar_url TEXT,
  bio TEXT,
  interests TEXT[],
  phone TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  distance_km DOUBLE PRECISION
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id, 
    p.full_name, 
    p.role, 
    p.avatar_url, 
    p.bio, 
    p.interests,
    p.phone,
    l.latitude, 
    l.longitude,
    -- Haversine formula
    (6371 * acos(
      cos(radians(my_lat)) * cos(radians(l.latitude)) * 
      cos(radians(l.longitude) - radians(my_lng)) + 
      sin(radians(my_lat)) * sin(radians(l.latitude))
    )) AS distance_km
  FROM profiles p
  JOIN locations l ON p.id = l.user_id
  JOIN availability a ON p.id = a.user_id
  WHERE a.is_available = true 
    AND p.id != auth.uid()
    AND (
      search_term = '' 
      OR p.role ILIKE '%' || search_term || '%'
      OR array_to_string(p.interests, ',') ILIKE '%' || search_term || '%'
      OR p.bio ILIKE '%' || search_term || '%'
    )
    AND (6371 * acos(
      cos(radians(my_lat)) * cos(radians(l.latitude)) * 
      cos(radians(l.longitude) - radians(my_lng)) + 
      sin(radians(my_lat)) * sin(radians(l.latitude))
    )) < radius_km
  ORDER BY distance_km ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 1. Create messages table if it doesn't exist
CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Add RLS to messages
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- 3. Add policies (drop first to avoid "policy already exists" error)
DROP POLICY IF EXISTS "Users can send messages" ON messages;
CREATE POLICY "Users can send messages" ON messages
  FOR INSERT WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "Users can read their own messages" ON messages;
CREATE POLICY "Users can read their own messages" ON messages
  FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- 4. Add to Realtime (safely)
-- If the publication exists, just add the table. If not, create it.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime FOR TABLE availability, locations, messages;
  ELSE
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL; -- Handle race conditions or existing state
END $$;

-- 5. SCHEDULED CLEANUP TASK (Pseudo-code / Manual Trigger)
-- In Supabase, you would typically use pg_cron or an Edge Function to run this periodically.
-- This query sets users to offline if they haven't been active in 4 hours.

CREATE OR REPLACE FUNCTION check_inactive_users()
RETURNS void AS $$
BEGIN
  UPDATE availability
  SET is_available = false
  WHERE is_available = true 
    AND last_active_at < NOW() - INTERVAL '4 hours';
END;
$$ LANGUAGE plpgsql;

-- If you have pg_cron enabled in Supabase (Extensions -> pg_cron):
-- SELECT cron.schedule('0 * * * *', $$SELECT check_inactive_users()$$);
