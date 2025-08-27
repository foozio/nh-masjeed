/**
 * Community API routes
 */
import { Router, Request, Response } from 'express';
import { authenticateToken, authorizeRoles, optionalAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';

const router = Router();

// Get community members (authenticated users only)
router.get('/members', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { 
      limit = 20, 
      offset = 0, 
      role, 
      search,
      is_volunteer_only = 'false'
    } = req.query;

    let query = supabaseAdmin
      .from('users')
      .select(`
        id,
        display_name,
        email,
        phone,
        address,
        profile_picture,
        is_volunteer,
        volunteer_skills,
        volunteer_availability,
        bio,
        joined_at,
        last_active,
        user_roles!inner(
          role_name
        )
      `)
      .eq('is_active', true)
      .order('display_name', { ascending: true });

    // Filter by role
    if (role) {
      query = query.eq('user_roles.role_name', role);
    }

    // Filter volunteers only
    if (is_volunteer_only === 'true') {
      query = query.eq('is_volunteer', true);
    }

    // Search by name or email
    if (search) {
      query = query.or(`display_name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    query = query.range(Number(offset), Number(offset) + Number(limit) - 1);

    const { data: members, error } = await query;

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    // Hide sensitive information based on user role
    const sanitizedMembers = members?.map(member => {
      const sanitized: any = {
        id: member.id,
        display_name: member.display_name,
        profile_picture: member.profile_picture,
        is_volunteer: member.is_volunteer,
        bio: member.bio,
        joined_at: member.joined_at,
        user_roles: member.user_roles
      };

      // Only show contact info to Admin/Imam/Pengurus or if user is volunteer
      if (['Admin', 'Imam', 'Pengurus'].includes(req.user?.role) || member.is_volunteer) {
        sanitized.email = member.email;
        sanitized.phone = member.phone;
        sanitized.address = member.address;
        sanitized.volunteer_skills = member.volunteer_skills;
        sanitized.volunteer_availability = member.volunteer_availability;
      }

      return sanitized;
    });

    res.json({ success: true, data: sanitizedMembers });
  } catch (error) {
    console.error('Get community members error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get member profile by ID (authenticated users only)
router.get('/members/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data: member, error } = await supabaseAdmin
      .from('users')
      .select(`
        id,
        display_name,
        email,
        phone,
        address,
        profile_picture,
        is_volunteer,
        volunteer_skills,
        volunteer_availability,
        bio,
        joined_at,
        last_active,
        user_roles!inner(
          role_name
        )
      `)
      .eq('id', id)
      .eq('is_active', true)
      .single();

    if (error || !member) {
      return res.status(404).json({ success: false, error: 'Member not found' });
    }

    // Hide sensitive information based on user role and privacy settings
    const sanitized: any = {
      id: member.id,
      display_name: member.display_name,
      profile_picture: member.profile_picture,
      is_volunteer: member.is_volunteer,
      bio: member.bio,
      joined_at: member.joined_at,
      user_roles: member.user_roles
    };

    // Show contact info if:
    // 1. Requesting own profile
    // 2. Admin/Imam/Pengurus role
    // 3. Member is volunteer and requester is authenticated
    if (req.user?.id === id || 
        ['Admin', 'Imam', 'Pengurus'].includes(req.user?.role) || 
        member.is_volunteer) {
      sanitized.email = member.email;
      sanitized.phone = member.phone;
      sanitized.address = member.address;
      sanitized.volunteer_skills = member.volunteer_skills;
      sanitized.volunteer_availability = member.volunteer_availability;
      sanitized.last_active = member.last_active;
    }

    res.json({ success: true, data: sanitized });
  } catch (error) {
    console.error('Get member profile error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Update member profile (own profile or Admin/Imam/Pengurus)
router.put('/members/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      display_name,
      phone,
      address,
      bio,
      is_volunteer,
      volunteer_skills,
      volunteer_availability
    } = req.body;

    // Check if user can update this profile
    if (req.user?.id !== id && !['Admin', 'Imam', 'Pengurus'].includes(req.user?.role)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    // Check if member exists
    const { data: existingMember, error: findError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', id)
      .single();

    if (findError || !existingMember) {
      return res.status(404).json({ success: false, error: 'Member not found' });
    }

    // Prepare update data
    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    if (display_name !== undefined) {
      if (!display_name.trim()) {
        return res.status(400).json({ success: false, error: 'Display name cannot be empty' });
      }
      updateData.display_name = display_name.trim();
    }

    if (phone !== undefined) {
      updateData.phone = phone?.trim() || null;
    }

    if (address !== undefined) {
      updateData.address = address?.trim() || null;
    }

    if (bio !== undefined) {
      updateData.bio = bio?.trim() || null;
    }

    if (is_volunteer !== undefined) {
      updateData.is_volunteer = is_volunteer;
      // Clear volunteer data if not volunteering
      if (!is_volunteer) {
        updateData.volunteer_skills = null;
        updateData.volunteer_availability = null;
      }
    }

    if (volunteer_skills !== undefined && (updateData.is_volunteer || existingMember.is_volunteer)) {
      updateData.volunteer_skills = volunteer_skills;
    }

    if (volunteer_availability !== undefined && (updateData.is_volunteer || existingMember.is_volunteer)) {
      updateData.volunteer_availability = volunteer_availability;
    }

    const { data: member, error } = await supabaseAdmin
      .from('users')
      .update(updateData)
      .eq('id', id)
      .select(`
        id,
        display_name,
        email,
        phone,
        address,
        profile_picture,
        is_volunteer,
        volunteer_skills,
        volunteer_availability,
        bio,
        joined_at,
        updated_at,
        user_roles!inner(
          role_name
        )
      `)
      .single();

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    // Log profile update
    await supabaseAdmin
      .from('audit_logs')
      .insert({
        user_id: req.user?.id,
        action: 'UPDATE',
        resource_type: 'USER_PROFILE',
        resource_id: id,
        details: {
          updated_fields: Object.keys(updateData),
          target_user: id !== req.user?.id ? id : 'self'
        }
      });

    res.json({ success: true, data: member });
  } catch (error) {
    console.error('Update member profile error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get volunteers (public with optional auth)
router.get('/volunteers', optionalAuth, async (req: Request, res: Response) => {
  try {
    const { 
      limit = 20, 
      offset = 0, 
      skills,
      availability
    } = req.query;

    let query = supabaseAdmin
      .from('users')
      .select(`
        id,
        display_name,
        profile_picture,
        volunteer_skills,
        volunteer_availability,
        bio,
        joined_at
      `)
      .eq('is_volunteer', true)
      .eq('is_active', true)
      .order('display_name', { ascending: true });

    // Filter by skills
    if (skills) {
      query = query.contains('volunteer_skills', [skills]);
    }

    // Filter by availability
    if (availability) {
      query = query.contains('volunteer_availability', [availability]);
    }

    query = query.range(Number(offset), Number(offset) + Number(limit) - 1);

    const { data: volunteers, error } = await query;

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    res.json({ success: true, data: volunteers });
  } catch (error) {
    console.error('Get volunteers error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get volunteer skills and availability options (public)
router.get('/volunteer-options', async (req: Request, res: Response) => {
  try {
    const skills = [
      'Teaching/Mengajar',
      'Event Organization/Organisasi Acara',
      'Technical Support/Dukungan Teknis',
      'Cleaning/Kebersihan',
      'Security/Keamanan',
      'Food Service/Pelayanan Makanan',
      'Translation/Terjemahan',
      'Photography/Fotografi',
      'Sound System/Sistem Suara',
      'First Aid/Pertolongan Pertama',
      'Childcare/Perawatan Anak',
      'Transportation/Transportasi'
    ];

    const availability = [
      'Weekdays Morning/Pagi Hari Kerja',
      'Weekdays Evening/Sore Hari Kerja',
      'Weekend Morning/Pagi Akhir Pekan',
      'Weekend Evening/Sore Akhir Pekan',
      'Friday Prayer/Sholat Jumat',
      'Special Events/Acara Khusus',
      'Ramadan/Bulan Ramadan',
      'Eid Celebrations/Perayaan Idul Fitri/Adha'
    ];

    res.json({ 
      success: true, 
      data: { 
        skills: skills.map(skill => ({ value: skill, label: skill })),
        availability: availability.map(avail => ({ value: avail, label: avail }))
      } 
    });
  } catch (error) {
    console.error('Get volunteer options error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get community statistics (Admin/Imam/Pengurus only)
router.get('/stats', authenticateToken, authorizeRoles('Admin', 'Imam', 'Pengurus'), async (req: Request, res: Response) => {
  try {
    // Get total members count
    const { count: totalMembers, error: membersError } = await supabaseAdmin
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    if (membersError) {
      return res.status(400).json({ success: false, error: membersError.message });
    }

    // Get volunteers count
    const { count: totalVolunteers, error: volunteersError } = await supabaseAdmin
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('is_volunteer', true)
      .eq('is_active', true);

    if (volunteersError) {
      return res.status(400).json({ success: false, error: volunteersError.message });
    }

    // Get members by role
    const { data: roleStats, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select(`
        role_name,
        users!inner(
          id
        )
      `);

    if (roleError) {
      return res.status(400).json({ success: false, error: roleError.message });
    }

    const membersByRole = roleStats?.reduce((acc: any, item) => {
      acc[item.role_name] = (acc[item.role_name] || 0) + 1;
      return acc;
    }, {}) || {};

    // Get recent joiners (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { count: recentJoiners, error: recentError } = await supabaseAdmin
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)
      .gte('joined_at', thirtyDaysAgo.toISOString());

    if (recentError) {
      return res.status(400).json({ success: false, error: recentError.message });
    }

    res.json({
      success: true,
      data: {
        total_members: totalMembers || 0,
        total_volunteers: totalVolunteers || 0,
        recent_joiners: recentJoiners || 0,
        members_by_role: membersByRole
      }
    });
  } catch (error) {
    console.error('Get community stats error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;