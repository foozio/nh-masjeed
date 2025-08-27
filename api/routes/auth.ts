import { Router, Request, Response } from 'express';
import passport from '../config/passport.js';
import { generateToken, authenticateToken } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';

const router = Router();

// Google OAuth login
router.get('/google',
  passport.authenticate('google', {
    scope: ['profile', 'email']
  })
);

// Google OAuth callback
router.get('/google/callback',
  passport.authenticate('google', { 
    failureRedirect: `${process.env.APP_URL || 'http://localhost:5173'}/login?error=auth_failed` 
  }),
  async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      
      if (!user) {
        console.log('No user found in callback');
        const frontendUrl = process.env.APP_URL || 'http://localhost:5173';
        return res.redirect(`${frontendUrl}/login?error=no_user`);
      }

      // Generate JWT token
      const token = generateToken({ userId: user.id, email: user.email });
      
      // Log successful login (don't let this fail the auth)
      try {
        await supabaseAdmin
          .from('audit_logs')
          .insert({
            user_id: user.id,
            action: 'LOGIN',
            resource_type: 'AUTH',
            details: {
              method: 'google_oauth',
              ip: req.ip,
              user_agent: req.get('User-Agent')
            }
          });
      } catch (logError) {
        console.error('Failed to log auth event:', logError);
        // Continue with auth even if logging fails
      }

      // Redirect to frontend with token
      const frontendUrl = process.env.APP_URL || 'http://localhost:5173';
      res.redirect(`${frontendUrl}/auth/success?token=${token}`);
    } catch (error) {
      console.error('Auth callback error:', error);
      const frontendUrl = process.env.APP_URL || 'http://localhost:5173';
      res.redirect(`${frontendUrl}/login?error=callback_failed`);
    }
  }
);

// Get current user profile
router.get('/me', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select(`
        id,
        email,
        display_name,
        avatar_url,
        phone_number,
        address,
        profile_data,
        created_at,
        user_roles!inner(
          role_name,
          assigned_at,
          is_active
        )
      `)
      .eq('id', userId)
      .eq('is_active', true)
      .single();

    if (error || !user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
        phone_number: user.phone_number,
        address: user.address,
        profile_data: user.profile_data,
        role: user.user_roles[0]?.role_name || 'Jamaah',
        created_at: user.created_at
      }
    });
  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Update user profile
router.put('/profile', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { display_name, phone_number, address } = req.body;

    // Validate input
    if (!display_name || display_name.trim().length < 2) {
      return res.status(400).json({ 
        success: false, 
        error: 'Display name must be at least 2 characters' 
      });
    }

    const { data: updatedUser, error } = await supabaseAdmin
      .from('users')
      .update({
        display_name: display_name.trim(),
        phone_number: phone_number?.trim() || null,
        address: address?.trim() || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .select('id, display_name, phone_number, address')
      .single();

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    // Log profile update
    await supabaseAdmin
      .from('audit_logs')
      .insert({
        user_id: userId,
        action: 'UPDATE',
        resource_type: 'USER_PROFILE',
        details: {
          updated_fields: ['display_name', 'phone_number', 'address']
        }
      });

    res.json({ success: true, data: updatedUser });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// User logout
router.post('/logout', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    
    // Log logout
    await supabaseAdmin
      .from('audit_logs')
      .insert({
        user_id: userId,
        action: 'LOGOUT',
        resource_type: 'AUTH',
        details: {
          ip: req.ip,
          user_agent: req.get('User-Agent')
        }
      });

    // Destroy session if using sessions
    req.logout((err) => {
      if (err) {
        console.error('Logout error:', err);
      }
    });

    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Refresh token
router.post('/refresh', authenticateToken, (req: Request, res: Response) => {
  try {
    const user = req.user;
    const newToken = generateToken({ userId: user?.id, email: user?.email });
    
    res.json({ success: true, data: { token: newToken } });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;