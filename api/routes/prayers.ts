/**
 * Prayer schedules API routes
 */
import { Router, Request, Response } from 'express';
import { authenticateToken, authorizeRoles, optionalAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';

const router = Router();

// Get prayer schedules (public)
router.get('/', optionalAuth, async (req: Request, res: Response) => {
  try {
    const { date, month, year } = req.query;
    let query = supabaseAdmin
      .from('prayer_schedules')
      .select('*')
      .order('prayer_date', { ascending: true });

    // Filter by specific date
    if (date) {
      query = query.eq('prayer_date', date);
    }
    // Filter by month and year
    else if (month && year) {
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDate = new Date(Number(year), Number(month), 0).toISOString().split('T')[0];
      query = query.gte('prayer_date', startDate).lte('prayer_date', endDate);
    }
    // Default to current month if no filters
    else {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
      query = query.gte('prayer_date', startOfMonth).lte('prayer_date', endOfMonth);
    }

    const { data: schedules, error } = await query.limit(100);

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    res.json({ success: true, data: schedules });
  } catch (error) {
    console.error('Get prayer schedules error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get today's prayer schedule
router.get('/today', optionalAuth, async (req: Request, res: Response) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const { data: schedule, error } = await supabaseAdmin
      .from('prayer_schedules')
      .select('*')
      .eq('prayer_date', today)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      return res.status(400).json({ success: false, error: error.message });
    }

    res.json({ success: true, data: schedule || null });
  } catch (error) {
    console.error('Get today prayer schedule error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Create prayer schedule (Admin/Imam only)
router.post('/', authenticateToken, authorizeRoles('Admin', 'Imam'), async (req: Request, res: Response) => {
  try {
    const {
      prayer_date,
      fajr,
      dhuhr,
      asr,
      maghrib,
      isha,
      hijri_date
    } = req.body;

    // Validate required fields
    if (!prayer_date || !fajr || !dhuhr || !asr || !maghrib || !isha) {
      return res.status(400).json({
        success: false,
        error: 'Missing required prayer times'
      });
    }

    // Check if schedule already exists for this date
    const { data: existing } = await supabaseAdmin
      .from('prayer_schedules')
      .select('id')
      .eq('prayer_date', prayer_date)
      .single();

    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'Prayer schedule already exists for this date'
      });
    }

    const { data: schedule, error } = await supabaseAdmin
      .from('prayer_schedules')
      .insert({
        prayer_date,
        fajr,
        dhuhr,
        asr,
        maghrib,
        isha,
        hijri_date: hijri_date?.trim() || null,
        updated_by: req.user?.id
      })
      .select('*')
      .single();

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    // Log creation
    await supabaseAdmin
      .from('audit_logs')
      .insert({
        user_id: req.user?.id,
        action: 'CREATE',
        resource_type: 'PRAYER_SCHEDULE',
        resource_id: schedule.id,
        details: { prayer_date }
      });

    res.status(201).json({ success: true, data: schedule });
  } catch (error) {
    console.error('Create prayer schedule error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Update prayer schedule (Admin/Imam only)
router.put('/:id', authenticateToken, authorizeRoles('Admin', 'Imam'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      fajr,
      dhuhr,
      asr,
      maghrib,
      isha,
      hijri_date
    } = req.body;

    const { data: schedule, error } = await supabaseAdmin
      .from('prayer_schedules')
      .update({
        fajr,
        dhuhr,
        asr,
        maghrib,
        isha,
        hijri_date: hijri_date?.trim() || null,
        updated_by: req.user?.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    // Log update
    await supabaseAdmin
      .from('audit_logs')
      .insert({
        user_id: req.user?.id,
        action: 'UPDATE',
        resource_type: 'PRAYER_SCHEDULE',
        resource_id: schedule.id,
        details: { updated_fields: Object.keys(req.body) }
      });

    res.json({ success: true, data: schedule });
  } catch (error) {
    console.error('Update prayer schedule error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Delete prayer schedule (Admin only)
router.delete('/:id', authenticateToken, authorizeRoles('Admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from('prayer_schedules')
      .delete()
      .eq('id', id);

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    // Log deletion
    await supabaseAdmin
      .from('audit_logs')
      .insert({
        user_id: req.user?.id,
        action: 'DELETE',
        resource_type: 'PRAYER_SCHEDULE',
        resource_id: id
      });

    res.json({ success: true, message: 'Prayer schedule deleted successfully' });
  } catch (error) {
    console.error('Delete prayer schedule error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;