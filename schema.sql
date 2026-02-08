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

-- Enable Row Level Security (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

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
