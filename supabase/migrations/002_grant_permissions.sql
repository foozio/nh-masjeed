-- Grant permissions to anon and authenticated roles for all tables

-- Check current permissions (for reference)
-- SELECT grantee, table_name, privilege_type 
-- FROM information_schema.role_table_grants 
-- WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated') 
-- ORDER BY table_name, grantee;

-- Grant SELECT permissions to anon role (for public data)
GRANT SELECT ON users TO anon;
GRANT SELECT ON user_roles TO anon;
GRANT SELECT ON events TO anon;
GRANT SELECT ON event_registrations TO anon;
GRANT SELECT ON donations TO anon;
GRANT SELECT ON announcements TO anon;
GRANT SELECT ON prayer_schedules TO anon;
GRANT SELECT ON audit_logs TO anon;

-- Grant full access to authenticated role (for logged-in users)
GRANT ALL PRIVILEGES ON users TO authenticated;
GRANT ALL PRIVILEGES ON user_roles TO authenticated;
GRANT ALL PRIVILEGES ON events TO authenticated;
GRANT ALL PRIVILEGES ON event_registrations TO authenticated;
GRANT ALL PRIVILEGES ON donations TO authenticated;
GRANT ALL PRIVILEGES ON announcements TO authenticated;
GRANT ALL PRIVILEGES ON prayer_schedules TO authenticated;
GRANT ALL PRIVILEGES ON audit_logs TO authenticated;

-- Grant usage on sequences (for UUID generation)
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Grant execute on functions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;