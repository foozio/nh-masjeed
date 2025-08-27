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
      is_published = 'true' 
    } = req.query;

    let query = supabaseAdmin
      .from('announcements')
      .select(`
        id,
        title,
        content,
        category,
        priority,
        is_published,
        published_at,
        created_at,
        updated_at,
        users!created_by(
          display_name
        )
      `)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false });

    // Filter by published status
    if (is_published !== 'all') {
      query = query.eq('is_published', is_published === 'true');
    }

    // Filter by category
    if (category) {
      query = query.eq('category', category);
    }

    // Filter by priority
    if (priority) {
      query = query.eq('priority', priority);
    }

    // Only show published announcements for public access
    if (!req.user || !['Admin', 'Imam', 'Pengurus'].includes(req.user?.role || '')) {
      query = query.eq('is_published', true);
    }

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

    // Check if announcement is published
    if (!announcement.is_published) {
      // Only allow admin/imam/pengurus to view unpublished announcements
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
      priority = 'normal',
      is_published = false,
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
    const validPriorities = ['low', 'normal', 'high', 'urgent'];
    if (!validPriorities.includes(priority)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid priority. Must be one of: low, normal, high, urgent'
      });
    }

    const insertData: any = {
      title: title.trim(),
      content: content.trim(),
      category,
      priority,
      created_by: req.user?.id,
      is_published
    };

    // Set published_at if publishing immediately
    if (is_published) {
      insertData.published_at = new Date().toISOString();
    }

    const { data: announcement, error } = await supabaseAdmin
      .from('announcements')
      .insert(insertData)
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

    // Send push notification if requested and announcement is published
    if (send_notification && is_published) {
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
          is_published,
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
      is_published,
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
      const validPriorities = ['low', 'normal', 'high', 'urgent'];
      if (!validPriorities.includes(priority)) {
        return res.status(400).json({ success: false, error: 'Invalid priority. Must be one of: low, normal, high, urgent' });
      }
      updateData.priority = priority;
    }

    if (is_published !== undefined) {
      updateData.is_published = is_published;
      // Set published_at when publishing
      if (is_published && !existingAnnouncement.is_published) {
        updateData.published_at = new Date().toISOString();
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

    // Send push notification if requested and announcement is published
    if (send_notification && announcement.is_published) {
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