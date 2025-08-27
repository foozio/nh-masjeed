/**
 * Events API routes
 */
import { Router, Request, Response } from 'express';
import { authenticateToken, authorizeRoles, optionalAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';

const router = Router();

// Get events (public with optional auth for registration status)
router.get('/', optionalAuth, async (req: Request, res: Response) => {
  try {
    const { type, status, upcoming, limit = 20, offset = 0 } = req.query;
    
    let query = supabaseAdmin
      .from('events')
      .select(`
        *,
        event_registrations(count)
      `)
      .order('event_datetime', { ascending: true });

    // Filter by event type
    if (type) {
      query = query.eq('type', type);
    }

    // Filter upcoming events
    if (upcoming === 'true') {
      const now = new Date().toISOString();
      query = query.gte('event_datetime', now);
    }

    // Pagination
    query = query.range(Number(offset), Number(offset) + Number(limit) - 1);

    const { data: events, error } = await query;

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    // If user is authenticated, check their registration status
    let eventsWithRegistration = events;
    if (req.user?.id) {
      const eventIds = events?.map(e => e.id) || [];
      const { data: registrations } = await supabaseAdmin
        .from('event_registrations')
        .select('event_id, status')
        .eq('user_id', req.user.id)
        .in('event_id', eventIds);

      eventsWithRegistration = events?.map(event => ({
        ...event,
        user_registration: registrations?.find(r => r.event_id === event.id) || null,
        registration_count: event.event_registrations?.[0]?.count || 0
      }));
    } else {
      eventsWithRegistration = events?.map(event => ({
        ...event,
        registration_count: event.event_registrations?.[0]?.count || 0
      }));
    }

    res.json({ success: true, data: eventsWithRegistration });
  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get single event
router.get('/:id', optionalAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data: event, error } = await supabaseAdmin
      .from('events')
      .select(`
        *,
        event_registrations(
          id,
          user_id,
          status,
          registered_at,
          users(
            display_name,
            avatar_url
          )
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    // Check user registration status if authenticated
    let userRegistration = null;
    if (req.user?.id) {
      const registration = event.event_registrations?.find(
        (r: any) => r.user_id === req.user?.id
      );
      userRegistration = registration || null;
    }

    res.json({
      success: true,
      data: {
        ...event,
        user_registration: userRegistration,
        registration_count: event.event_registrations?.length || 0
      }
    });
  } catch (error) {
    console.error('Get event error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Create event (Admin/Imam/Pengurus only)
router.post('/', authenticateToken, authorizeRoles('Admin', 'Imam', 'Pengurus'), async (req: Request, res: Response) => {
  try {
    const {
      title,
      description,
      type,
      event_datetime,
      location,
      capacity,
      speaker
    } = req.body;

    // Validate required fields
    if (!title || !type || !event_datetime || !location) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: title, type, event_datetime, location'
      });
    }

    // Validate event type
    const validTypes = ['kajian', 'jumat', 'pengajian'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid event type'
      });
    }

    const { data: event, error } = await supabaseAdmin
      .from('events')
      .insert({
        title: title.trim(),
        description: description?.trim() || null,
        type,
        event_datetime,
        location: location.trim(),
        capacity: capacity || null,
        speaker: speaker?.trim() || null,
        created_by: req.user?.id
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
        resource_type: 'EVENT',
        resource_id: event.id,
        details: { title, type, event_datetime }
      });

    res.status(201).json({ success: true, data: event });
  } catch (error) {
    console.error('Create event error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Update event (Admin/Imam/Pengurus only)
router.put('/:id', authenticateToken, authorizeRoles('Admin', 'Imam', 'Pengurus'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };
    delete updateData.id;
    delete updateData.created_by;
    delete updateData.created_at;
    
    updateData.updated_at = new Date().toISOString();

    const { data: event, error } = await supabaseAdmin
      .from('events')
      .update(updateData)
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
        resource_type: 'EVENT',
        resource_id: event.id,
        details: { updated_fields: Object.keys(req.body) }
      });

    res.json({ success: true, data: event });
  } catch (error) {
    console.error('Update event error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Register for event (authenticated users)
router.post('/:id/register', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    // Check if event exists
    const { data: event, error: eventError } = await supabaseAdmin
      .from('events')
      .select('*')
      .eq('id', id)
      .single();

    if (eventError || !event) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    // Check if event is full (if capacity is set)
    if (event.capacity) {
      const { count } = await supabaseAdmin
        .from('event_registrations')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', id);

      if (count && count >= event.capacity) {
        return res.status(400).json({
          success: false,
          error: 'Event is full'
        });
      }
    }

    // Check if user is already registered
    const { data: existingRegistration } = await supabaseAdmin
      .from('event_registrations')
      .select('*')
      .eq('event_id', id)
      .eq('user_id', userId)
      .single();

    if (existingRegistration) {
      return res.status(400).json({
        success: false,
        error: 'Already registered for this event'
      });
    }

    // Create registration
    const { data: registration, error } = await supabaseAdmin
      .from('event_registrations')
      .insert({
        event_id: id,
        user_id: userId
      })
      .select('*')
      .single();

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    // Log registration
    await supabaseAdmin
      .from('audit_logs')
      .insert({
        user_id: userId,
        action: 'CREATE',
        resource_type: 'EVENT_REGISTRATION',
        resource_id: registration.id,
        details: { event_id: id, event_title: event.title }
      });

    res.status(201).json({ success: true, data: registration });
  } catch (error) {
    console.error('Event registration error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Cancel event registration (authenticated users)
router.delete('/:id/register', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const { error } = await supabaseAdmin
      .from('event_registrations')
      .delete()
      .eq('event_id', id)
      .eq('user_id', userId);

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    // Log cancellation
    await supabaseAdmin
      .from('audit_logs')
      .insert({
        user_id: userId,
        action: 'DELETE',
        resource_type: 'EVENT_REGISTRATION',
        details: { event_id: id, action: 'cancelled_registration' }
      });

    res.json({ success: true, message: 'Registration cancelled successfully' });
  } catch (error) {
    console.error('Cancel registration error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Delete event (Admin only)
router.delete('/:id', authenticateToken, authorizeRoles('Admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Soft delete by setting is_active to false
    const { error } = await supabaseAdmin
      .from('events')
      .update({ is_active: false, updated_at: new Date().toISOString() })
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
        resource_type: 'EVENT',
        resource_id: id
      });

    res.json({ success: true, message: 'Event deleted successfully' });
  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;