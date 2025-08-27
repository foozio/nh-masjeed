/**
 * Passport configuration for Google OAuth
 */
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { supabaseAdmin } from '../lib/supabase.js';
import dotenv from 'dotenv';

dotenv.config();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/auth/google/callback';

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  throw new Error('Missing Google OAuth environment variables');
}

// Serialize user for session
passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id: string, done) => {
  try {
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select(`
        id,
        email,
        display_name,
        avatar_url,
        user_roles!inner(
          role_name,
          is_active
        )
      `)
      .eq('id', id)
      .eq('is_active', true)
      .single();

    if (error || !user) {
      console.error('Deserialize user error:', error);
      return done(null, null); // Don't pass error to avoid crashes
    }

    done(null, {
      id: user.id,
      email: user.email,
      display_name: user.display_name,
      avatar_url: user.avatar_url,
      role: user.user_roles[0]?.role_name || 'Jamaah'
    });
  } catch (error) {
    console.error('Deserialize user exception:', error);
    done(null, null); // Don't pass error to avoid crashes
  }
});

// Google OAuth Strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      callbackURL: GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        const googleId = profile.id;
        const displayName = profile.displayName;
        const avatarUrl = profile.photos?.[0]?.value;

        if (!email) {
          return done(new Error('No email found in Google profile'), null);
        }

        // Check if user already exists
        const { data: existingUser, error: fetchError } = await supabaseAdmin
          .from('users')
          .select(`
            id,
            email,
            display_name,
            avatar_url,
            user_roles!inner(
              role_name,
              is_active
            )
          `)
          .eq('email', email)
          .eq('is_active', true)
          .single();

        if (fetchError && fetchError.code !== 'PGRST116') {
          console.error('Error fetching existing user:', fetchError);
          return done(null, null); // Don't pass error to avoid crashes
        }

        if (existingUser) {
          try {
            // Update existing user's Google ID and avatar if needed
            await supabaseAdmin
              .from('users')
              .update({
                google_id: googleId,
                avatar_url: avatarUrl,
                updated_at: new Date().toISOString()
              })
              .eq('id', existingUser.id);

            return done(null, {
              id: existingUser.id,
              email: existingUser.email,
              display_name: existingUser.display_name,
              avatar_url: avatarUrl,
              role: existingUser.user_roles[0]?.role_name || 'Jamaah'
            });
          } catch (updateError) {
            console.error('Error updating existing user:', updateError);
            // Still return the user even if update fails
            return done(null, {
              id: existingUser.id,
              email: existingUser.email,
              display_name: existingUser.display_name,
              avatar_url: existingUser.avatar_url,
              role: existingUser.user_roles[0]?.role_name || 'Jamaah'
            });
          }
        }

        // Create new user
        try {
          const { data: newUser, error: createError } = await supabaseAdmin
            .from('users')
            .insert({
              email,
              google_id: googleId,
              display_name: displayName,
              avatar_url: avatarUrl,
              profile_data: {
                provider: 'google',
                first_login: new Date().toISOString()
              }
            })
            .select('id, email, display_name, avatar_url')
            .single();

          if (createError || !newUser) {
            console.error('Error creating new user:', createError);
            return done(null, null); // Don't pass error to avoid crashes
          }

          // Assign default role (Jamaah)
          try {
            await supabaseAdmin
              .from('user_roles')
              .insert({
                user_id: newUser.id,
                role_name: 'Jamaah',
                assigned_by: newUser.id // Self-assigned for new users
              });
          } catch (roleError) {
            console.error('Error assigning role to new user:', roleError);
            // Continue even if role assignment fails
          }

          return done(null, {
            id: newUser.id,
            email: newUser.email,
            display_name: newUser.display_name,
            avatar_url: newUser.avatar_url,
            role: 'Jamaah'
          });
        } catch (userCreationError) {
          console.error('Exception during user creation:', userCreationError);
          return done(null, null); // Don't pass error to avoid crashes
        }
      } catch (error) {
         console.error('Google OAuth strategy error:', error);
         return done(null, null); // Don't pass error to avoid crashes
       }
    }
  )
);

export default passport;