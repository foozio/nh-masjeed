-- Masjeed PWA - Initial Database Schema
-- This migration creates all the required tables for the Masjeed application

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    google_id VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    avatar_url TEXT,
    profile_data JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for users table
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_google_id ON users(google_id);
CREATE INDEX idx_users_active ON users(is_active);

-- Create user_roles table
CREATE TABLE user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('Admin', 'Imam', 'Pengurus', 'Jamaah')),
    is_active BOOLEAN DEFAULT true,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    assigned_by UUID REFERENCES users(id)
);

-- Create indexes for user_roles table
CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_user_roles_role ON user_roles(role);
CREATE INDEX idx_user_roles_active ON user_roles(is_active);

-- Create events table
CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('kajian', 'jumat', 'pengajian')),
    event_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
    speaker VARCHAR(100),
    capacity INTEGER,
    location VARCHAR(200) NOT NULL,
    created_by UUID REFERENCES users(id) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for events table
CREATE INDEX idx_events_type ON events(type);
CREATE INDEX idx_events_datetime ON events(event_datetime);
CREATE INDEX idx_events_created_by ON events(created_by);

-- Create event_registrations table
CREATE TABLE event_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    notes TEXT,
    status VARCHAR(20) DEFAULT 'registered' CHECK (status IN ('registered', 'attended', 'cancelled')),
    registered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for event_registrations table
CREATE INDEX idx_event_registrations_event_id ON event_registrations(event_id);
CREATE INDEX idx_event_registrations_user_id ON event_registrations(user_id);
CREATE INDEX idx_event_registrations_status ON event_registrations(status);

-- Create unique constraint to prevent duplicate registrations
CREATE UNIQUE INDEX idx_event_registrations_unique ON event_registrations(event_id, user_id);

-- Create donations table
CREATE TABLE donations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    type VARCHAR(20) NOT NULL CHECK (type IN ('general', 'zakat', 'sadaqah')),
    payment_method VARCHAR(50) NOT NULL,
    payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'completed', 'failed', 'refunded')),
    transaction_id VARCHAR(100),
    is_anonymous BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for donations table
CREATE INDEX idx_donations_user_id ON donations(user_id);
CREATE INDEX idx_donations_type ON donations(type);
CREATE INDEX idx_donations_status ON donations(payment_status);
CREATE INDEX idx_donations_created_at ON donations(created_at DESC);

-- Create announcements table
CREATE TABLE announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    priority VARCHAR(10) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    category VARCHAR(50) NOT NULL,
    created_by UUID REFERENCES users(id) NOT NULL,
    is_published BOOLEAN DEFAULT false,
    published_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for announcements table
CREATE INDEX idx_announcements_priority ON announcements(priority);
CREATE INDEX idx_announcements_category ON announcements(category);
CREATE INDEX idx_announcements_created_by ON announcements(created_by);
CREATE INDEX idx_announcements_published ON announcements(is_published);
CREATE INDEX idx_announcements_published_at ON announcements(published_at DESC);

-- Create prayer_schedules table
CREATE TABLE prayer_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prayer_date DATE NOT NULL UNIQUE,
    fajr TIME NOT NULL,
    dhuhr TIME NOT NULL,
    asr TIME NOT NULL,
    maghrib TIME NOT NULL,
    isha TIME NOT NULL,
    hijri_date VARCHAR(20),
    updated_by UUID REFERENCES users(id),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for prayer_schedules table
CREATE INDEX idx_prayer_schedules_date ON prayer_schedules(prayer_date);
CREATE INDEX idx_prayer_schedules_updated_by ON prayer_schedules(updated_by);

-- Create audit_logs table
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(50) NOT NULL,
    resource VARCHAR(50) NOT NULL,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for audit_logs table
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- Enable Row Level Security on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE donations ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE prayer_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies for users table
CREATE POLICY "Users can view their own profile" ON users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON users
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can view all users" ON users
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_roles 
            WHERE user_id = auth.uid() 
            AND role = 'Admin'
            AND is_active = true
        )
    );

-- Create RLS Policies for user_roles table
CREATE POLICY "Users can view their own roles" ON user_roles
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles" ON user_roles
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM user_roles 
            WHERE user_id = auth.uid() 
            AND role = 'Admin'
            AND is_active = true
        )
    );

-- Create RLS Policies for events table
CREATE POLICY "Everyone can view events" ON events
    FOR SELECT USING (true);

CREATE POLICY "Authorized users can create events" ON events
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_roles 
            WHERE user_id = auth.uid() 
            AND role IN ('Admin', 'Imam', 'Pengurus')
            AND is_active = true
        )
    );

CREATE POLICY "Event creators and admins can update events" ON events
    FOR UPDATE USING (
        auth.uid() = created_by OR
        EXISTS (
            SELECT 1 FROM user_roles 
            WHERE user_id = auth.uid() 
            AND role IN ('Admin', 'Imam')
            AND is_active = true
        )
    );

-- Create RLS Policies for event_registrations table
CREATE POLICY "Users can view their own registrations" ON event_registrations
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can register for events" ON event_registrations
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own registrations" ON event_registrations
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Event creators can view all registrations" ON event_registrations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM events 
            WHERE id = event_id 
            AND created_by = auth.uid()
        )
    );

-- Create RLS Policies for donations table
CREATE POLICY "Users can view their own donations" ON donations
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create donations" ON donations
    FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Admins can view all donations" ON donations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_roles 
            WHERE user_id = auth.uid() 
            AND role IN ('Admin', 'Pengurus')
            AND is_active = true
        )
    );

-- Create RLS Policies for announcements table
CREATE POLICY "Everyone can view published announcements" ON announcements
    FOR SELECT USING (is_published = true);

CREATE POLICY "Authorized users can create announcements" ON announcements
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_roles 
            WHERE user_id = auth.uid() 
            AND role IN ('Admin', 'Imam', 'Pengurus')
            AND is_active = true
        )
    );

CREATE POLICY "Announcement creators and admins can update announcements" ON announcements
    FOR UPDATE USING (
        auth.uid() = created_by OR
        EXISTS (
            SELECT 1 FROM user_roles 
            WHERE user_id = auth.uid() 
            AND role IN ('Admin', 'Imam')
            AND is_active = true
        )
    );

-- Create RLS Policies for prayer_schedules table
CREATE POLICY "Everyone can view prayer schedules" ON prayer_schedules
    FOR SELECT USING (true);

CREATE POLICY "Authorized users can manage prayer schedules" ON prayer_schedules
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM user_roles 
            WHERE user_id = auth.uid() 
            AND role IN ('Admin', 'Imam')
            AND is_active = true
        )
    );

-- Create RLS Policies for audit_logs table
CREATE POLICY "Admins can view all audit logs" ON audit_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_roles 
            WHERE user_id = auth.uid() 
            AND role = 'Admin'
            AND is_active = true
        )
    );

-- Grant permissions to anon and authenticated roles
GRANT SELECT ON users TO anon;
GRANT ALL PRIVILEGES ON users TO authenticated;

GRANT SELECT ON user_roles TO authenticated;
GRANT ALL PRIVILEGES ON user_roles TO authenticated;

GRANT SELECT ON events TO anon;
GRANT ALL PRIVILEGES ON events TO authenticated;

GRANT SELECT ON event_registrations TO authenticated;
GRANT ALL PRIVILEGES ON event_registrations TO authenticated;

GRANT SELECT ON donations TO authenticated;
GRANT ALL PRIVILEGES ON donations TO authenticated;

GRANT SELECT ON announcements TO anon;
GRANT ALL PRIVILEGES ON announcements TO authenticated;

GRANT SELECT ON prayer_schedules TO anon;
GRANT ALL PRIVILEGES ON prayer_schedules TO authenticated;

GRANT SELECT ON audit_logs TO authenticated;
GRANT ALL PRIVILEGES ON audit_logs TO authenticated;

-- Insert initial data
-- Note: This will be updated with actual Google OAuth data when first admin logs in
INSERT INTO users (email, google_id, display_name) 
VALUES ('admin@masjeed.app', 'temp_google_id_' || gen_random_uuid(), 'System Administrator');

-- Insert default admin role
INSERT INTO user_roles (user_id, role) 
SELECT id, 'Admin' FROM users WHERE email = 'admin@masjeed.app';

-- Insert sample prayer schedule for current month
INSERT INTO prayer_schedules (prayer_date, fajr, dhuhr, asr, maghrib, isha, hijri_date)
VALUES 
    (CURRENT_DATE, '05:30', '12:15', '15:45', '18:30', '19:45', '1 Muharram 1446'),
    (CURRENT_DATE + 1, '05:31', '12:15', '15:45', '18:29', '19:44', '2 Muharram 1446'),
    (CURRENT_DATE + 2, '05:32', '12:15', '15:45', '18:28', '19:43', '3 Muharram 1446');

-- Insert sample announcement
INSERT INTO announcements (title, content, priority, category, created_by, is_published, published_at)
SELECT 
    'Selamat Datang di Masjeed PWA',
    'Aplikasi manajemen masjid digital telah aktif. Silakan login menggunakan akun Google Anda untuk mengakses fitur-fitur yang tersedia.',
    'high',
    'system',
    id,
    true,
    NOW()
FROM users WHERE email = 'admin@masjeed.app';