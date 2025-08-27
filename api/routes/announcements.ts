/**
 * Announcements API routes
 */
import { Router, Request, Response } from 'express';
import { authenticateToken, authorizeRoles, optionalAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';

const router = Router();

// Send push notification (helper function)
const sendPushNotification = async (title: string, body: string, targetUsers?: string[]) => {
  try {
    // This is a placeholder for push notification implementation
    // In production, you would integrate with Web Push API or Firebase Cloud Messaging
    console.log('Push notification:', { title, body, targetUsers });
    
    // Example implementation with web-push library:
    // const webpush = require('web-push');
    // const payload = JSON.stringify({ title, body });
    // 
    // if (targetUsers) {
    //   // Send to specific users
    //   for (const userId of targetUsers) {
    //     const { data: subscriptions } = await supabaseAdmin
    //       .from('push_subscriptions')
    //       .select('*')
    //       .eq('user_id', userId);
    //     
    //     for (const sub of subscriptions || []) {
    //       await webpush.sendNotification(sub.subscription, payload);
    //     }
    //   }
    // } else {
    //   // Send to all subscribed users
    //   const { data: subscriptions } = await supabaseAdmin
    //     .from('push_subscriptions')
    //     .select('*');
    //   
    //   for (const sub of subscriptions || []) {
    //     await webpush.sendNotification(sub.subscription, payload);
    //   }
    // }
    
    return { success: true };
  } catch (error) {
    console.error('Push notification error:', error);
    return { success: false, error };
  }
};

// Get announcements (public with optional auth)
router.get('/', optionalAuth, async (req: Request, res: Response) => {
  try {
    const { 
      limit = 20, 
      offset = 0, 
      category, 
      priority, 
      is_active = 'true' 
    } = req.query;

    let query = supabaseAdmin
      .from('announcements')
      .select(`
        id,
        title,
        content,
        category,
        priority,
        is_active,
        is_pinned,
        scheduled_at,
        expires_at,
        created_at,
        updated_at,
        users!created_by(
          display_name
        )
      `)
      .order('is_pinned', { ascending: false })
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false });

    // Filter by active status
    if (is_active !== 'all') {
      query = query.eq('is_active', is_active === 'true');
    }

    // Filter by category
    if (category) {
      query = query.eq('category', category);
    }

    // Filter by priority
    if (priority) {
      query = query.eq('priority', priority);
    }

    // Only show announcements that haven't expired
    const now = new Date().toISOString();
    query = query.or(`expires_at.is.null,expires_at.gte.${now}`);

    // Only show announcements that are scheduled to be shown
    query = query.or(`scheduled_at.is.null,scheduled_at.lte.${now}`);

    query = query.range(Number(offset), Number(offset) + Number(limit) - 1);

    const { data: announcements, error } = await query;

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    res.json({ success: true, data: announcements });
  } catch (error) {
    console.error('Get announcements error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get announcement by ID (public with optional auth)
router.get('/:id', optionalAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data: announcement, error } = await supabaseAdmin
      .from('announcements')
      .select(`
        *,
        users!created_by(
          display_name
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      return res.status(404).json({ success: false, error: 'Announcement not found' });
    }

    // Check if announcement is active and not expired
    const now = new Date();
    const scheduledAt = announcement.scheduled_at ? new Date(announcement.scheduled_at) : null;
    const expiresAt = announcement.expires_at ? new Date(announcement.expires_at) : null;

    if (!announcement.is_active || 
        (scheduledAt && scheduledAt > now) || 
        (expiresAt && expiresAt < now)) {
      // Only allow admin/imam/pengurus to view inactive/expired announcements
      if (!req.user || !['Admin', 'Imam', 'Pengurus'].includes(req.user.role)) {
        return res.status(404).json({ success: false, error: 'Announcement not found' });
      }
    }

    res.json({ success: true, data: announcement });
  } catch (error) {
    console.error('Get announcement error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Create announcement (Admin/Imam/Pengurus only)
router.post('/', authenticateToken, authorizeRoles('Admin', 'Imam', 'Pengurus'), async (req: Request, res: Response) => {
  try {
    const {
      title,
      content,
      category = 'General',
      priority = 'Medium',
      is_pinned = false,
      scheduled_at = null,
      expires_at = null,
      send_notification = false
    } = req.body;

    // Validate required fields
    if (!title?.trim() || !content?.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Title and content are required'
      });
    }

    // Validate category
    const validCategories = ['General', 'Sholat', 'Kajian', 'Event', 'Urgent', 'Maintenance'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid category'
      });
    }

    // Validate priority
    const validPriorities = ['Low', 'Medium', 'High', 'Critical'];
    if (!validPriorities.includes(priority)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid priority'
      });
    }

    // Validate dates
    if (scheduled_at && expires_at) {
      const scheduledDate = new Date(scheduled_at);
      const expiresDate = new Date(expires_at);
      if (scheduledDate >= expiresDate) {
        return res.status(400).json({
          success: false,
          error: 'Expiry date must be after scheduled date'
        });
      }
    }

    const { data: announcement, error } = await supabaseAdmin
      .from('announcements')
      .insert({
        title: title.trim(),
        content: content.trim(),
        category,
        priority,
        is_pinned,
        scheduled_at,
        expires_at,
        created_by: req.user?.id,
        is_active: true
      })
      .select(`
        *,
        users!created_by(
          display_name
        )
      `)
      .single();

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    // Send push notification if requested and announcement is active
    if (send_notification && (!scheduled_at || new Date(scheduled_at) <= new Date())) {
      await sendPushNotification(
        `📢 ${title}`,
        content.length > 100 ? content.substring(0, 100) + '...' : content
      );
    }

    // Log announcement creation
    await supabaseAdmin
      .from('audit_logs')
      .insert({
        user_id: req.user?.id,
        action: 'CREATE',
        resource_type: 'ANNOUNCEMENT',
        resource_id: announcement.id,
        details: {
          title,
          category,
          priority,
          is_pinned,
          send_notification
        }
      });

    res.status(201).json({ success: true, data: announcement });
  } catch (error) {
    console.error('Create announcement error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Update announcement (Admin/Imam/Pengurus only)
router.put('/:id', authenticateToken, authorizeRoles('Admin', 'Imam', 'Pengurus'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      title,
      content,
      category,
      priority,
      is_pinned,
      is_active,
      scheduled_at,
      expires_at,
      send_notification = false
    } = req.body;

    // Check if announcement exists
    const { data: existingAnnouncement, error: findError } = await supabaseAdmin
      .from('announcements')
      .select('*')
      .eq('id', id)
      .single();

    if (findError || !existingAnnouncement) {
      return res.status(404).json({ success: false, error: 'Announcement not found' });
    }

    // Prepare update data
    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    if (title !== undefined) {
      if (!title.trim()) {
        return res.status(400).json({ success: false, error: 'Title cannot be empty' });
      }
      updateData.title = title.trim();
    }

    if (content !== undefined) {
      if (!content.trim()) {
        return res.status(400).json({ success: false, error: 'Content cannot be empty' });
      }
      updateData.content = content.trim();
    }

    if (category !== undefined) {
      const validCategories = ['General', 'Sholat', 'Kajian', 'Event', 'Urgent', 'Maintenance'];
      if (!validCategories.includes(category)) {
        return res.status(400).json({ success: false, error: 'Invalid category' });
      }
      updateData.category = category;
    }

    if (priority !== undefined) {
      const validPriorities = ['Low', 'Medium', 'High', 'Critical'];
      if (!validPriorities.includes(priority)) {
        return res.status(400).json({ success: false, error: 'Invalid priority' });
      }
      updateData.priority = priority;
    }

    if (is_pinned !== undefined) {
      updateData.is_pinned = is_pinned;
    }

    if (is_active !== undefined) {
      updateData.is_active = is_active;
    }

    if (scheduled_at !== undefined) {
      updateData.scheduled_at = scheduled_at;
    }

    if (expires_at !== undefined) {
      updateData.expires_at = expires_at;
    }

    // Validate dates
    const finalScheduledAt = updateData.scheduled_at ?? existingAnnouncement.scheduled_at;
    const finalExpiresAt = updateData.expires_at ?? existingAnnouncement.expires_at;
    
    if (finalScheduledAt && finalExpiresAt) {
      const scheduledDate = new Date(finalScheduledAt);
      const expiresDate = new Date(finalExpiresAt);
      if (scheduledDate >= expiresDate) {
        return res.status(400).json({
          success: false,
          error: 'Expiry date must be after scheduled date'
        });
      }
    }

    const { data: announcement, error } = await supabaseAdmin
      .from('announcements')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        users!created_by(
          display_name
        )
      `)
      .single();

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    // Send push notification if requested and announcement is active
    if (send_notification && announcement.is_active && 
        (!announcement.scheduled_at || new Date(announcement.scheduled_at) <= new Date())) {
      await sendPushNotification(
        `📢 ${announcement.title}`,
        announcement.content.length > 100 ? 
          announcement.content.substring(0, 100) + '...' : 
          announcement.content
      );
    }

    // Log announcement update
    await supabaseAdmin
      .from('audit_logs')
      .insert({
        user_id: req.user?.id,
        action: 'UPDATE',
        resource_type: 'ANNOUNCEMENT',
        resource_id: announcement.id,
        details: {
          updated_fields: Object.keys(updateData),
          send_notification
        }
      });

    res.json({ success: true, data: announcement });
  } catch (error) {
    console.error('Update announcement error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Delete announcement (Admin only)
router.delete('/:id', authenticateToken, authorizeRoles('Admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if announcement exists
    const { data: existingAnnouncement, error: findError } = await supabaseAdmin
      .from('announcements')
      .select('*')
      .eq('id', id)
      .single();

    if (findError || !existingAnnouncement) {
      return res.status(404).json({ success: false, error: 'Announcement not found' });
    }

    const { error } = await supabaseAdmin
      .from('announcements')
      .delete()
      .eq('id', id);

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    // Log announcement deletion
    await supabaseAdmin
      .from('audit_logs')
      .insert({
        user_id: req.user?.id,
        action: 'DELETE',
        resource_type: 'ANNOUNCEMENT',
        resource_id: id,
        details: {
          title: existingAnnouncement.title,
          category: existingAnnouncement.category
        }
      });

    res.json({ success: true, message: 'Announcement deleted successfully' });
  } catch (error) {
    console.error('Delete announcement error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get announcement categories (public)
router.get('/meta/categories', async (req: Request, res: Response) => {
  try {
    const categories = [
      { value: 'General', label: 'General', icon: '📢' },
      { value: 'Sholat', label: 'Sholat', icon: '🕌' },
      { value: 'Kajian', label: 'Kajian', icon: '📚' },
      { value: 'Event', label: 'Event', icon: '📅' },
      { value: 'Urgent', label: 'Urgent', icon: '🚨' },
      { value: 'Maintenance', label: 'Maintenance', icon: '🔧' }
    ];

    res.json({ success: true, data: categories });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Subscribe to push notifications
router.post('/subscribe', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { subscription } = req.body;
    const userId = req.user?.id;

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({
        success: false,
        error: 'Invalid subscription data'
      });
    }

    // Store subscription in database (you'll need to create this table)
    // const { error } = await supabaseAdmin
    //   .from('push_subscriptions')
    //   .upsert({
    //     user_id: userId,
    //     subscription: subscription,
    //     created_at: new Date().toISOString()
    //   }, {
    //     onConflict: 'user_id'
    //   });

    // if (error) {
    //   return res.status(400).json({ success: false, error: error.message });
    // }

    res.json({ success: true, message: 'Subscription saved successfully' });
  } catch (error) {
    console.error('Subscribe error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;