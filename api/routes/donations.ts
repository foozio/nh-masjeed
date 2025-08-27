/**
 * Donations API routes
 */
import { Router, Request, Response } from 'express';
import { authenticateToken, authorizeRoles, optionalAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';
import crypto from 'crypto';

const router = Router();

// Generate QR code data for payment
const generateQRCode = (amount: number, donationType: string, reference: string) => {
  // This is a simplified QR code data structure
  // In production, you would integrate with actual payment gateway QR codes
  const qrData = {
    merchant_id: process.env.MERCHANT_ID || 'MASJEED_001',
    amount: amount,
    currency: 'IDR',
    reference: reference,
    description: `${donationType} - ${reference}`,
    callback_url: `${process.env.API_URL}/api/donations/callback`
  };
  
  return Buffer.from(JSON.stringify(qrData)).toString('base64');
};

// Get donation campaigns (public)
router.get('/campaigns', optionalAuth, async (req: Request, res: Response) => {
  try {
    const { status = 'Active', limit = 10, offset = 0 } = req.query;
    
    let query = supabaseAdmin
      .from('donations')
      .select(`
        id,
        donation_type,
        amount,
        target_amount,
        description,
        status,
        created_at,
        updated_at
      `)
      .eq('is_campaign', true)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (status !== 'All') {
      query = query.eq('status', status);
    }

    query = query.range(Number(offset), Number(offset) + Number(limit) - 1);

    const { data: campaigns, error } = await query;

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    // Calculate total raised for each campaign
    const campaignsWithTotals = await Promise.all(
      campaigns?.map(async (campaign) => {
        const { data: donations } = await supabaseAdmin
          .from('donations')
          .select('amount')
          .eq('campaign_id', campaign.id)
          .eq('status', 'Completed');

        const totalRaised = donations?.reduce((sum, d) => sum + d.amount, 0) || 0;
        const progress = campaign.target_amount ? (totalRaised / campaign.target_amount) * 100 : 0;

        return {
          ...campaign,
          total_raised: totalRaised,
          progress: Math.min(progress, 100)
        };
      }) || []
    );

    res.json({ success: true, data: campaignsWithTotals });
  } catch (error) {
    console.error('Get donation campaigns error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get donation statistics (Admin/Imam/Pengurus only)
router.get('/stats', authenticateToken, authorizeRoles('Admin', 'Imam', 'Pengurus'), async (req: Request, res: Response) => {
  try {
    const { period = 'month' } = req.query;
    
    let dateFilter = '';
    const now = new Date();
    
    switch (period) {
      case 'week':
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        dateFilter = weekAgo.toISOString();
        break;
      case 'month':
        const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        dateFilter = monthAgo.toISOString();
        break;
      case 'year':
        const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        dateFilter = yearAgo.toISOString();
        break;
      default:
        const defaultAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        dateFilter = defaultAgo.toISOString();
    }

    // Get donation statistics
    const { data: stats, error } = await supabaseAdmin
      .from('donations')
      .select('donation_type, amount, status, created_at')
      .eq('status', 'Completed')
      .gte('created_at', dateFilter);

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    // Calculate statistics
    const totalAmount = stats?.reduce((sum, d) => sum + d.amount, 0) || 0;
    const totalCount = stats?.length || 0;
    
    const byType = stats?.reduce((acc: any, d) => {
      acc[d.donation_type] = (acc[d.donation_type] || 0) + d.amount;
      return acc;
    }, {}) || {};

    res.json({
      success: true,
      data: {
        total_amount: totalAmount,
        total_count: totalCount,
        average_amount: totalCount > 0 ? totalAmount / totalCount : 0,
        by_type: byType,
        period
      }
    });
  } catch (error) {
    console.error('Get donation stats error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Create donation/zakat (authenticated users)
router.post('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const {
      donation_type,
      amount,
      description,
      is_anonymous = false,
      campaign_id = null
    } = req.body;

    // Validate required fields
    if (!donation_type || !amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid donation type or amount'
      });
    }

    // Validate donation type
    const validTypes = ['Infaq', 'Sedekah', 'Zakat Fitrah', 'Zakat Mal', 'Wakaf', 'Operasional'];
    if (!validTypes.includes(donation_type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid donation type'
      });
    }

    // Generate unique reference
    const reference = `DON-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    
    // Generate QR code data
    const qrCodeData = generateQRCode(amount, donation_type, reference);

    const { data: donation, error } = await supabaseAdmin
      .from('donations')
      .insert({
        donor_id: req.user?.id,
        donation_type,
        amount,
        description: description?.trim() || null,
        is_anonymous,
        campaign_id,
        reference_number: reference,
        qr_code_data: qrCodeData,
        status: 'Pending',
        payment_method: 'QR_CODE'
      })
      .select('*')
      .single();

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    // Log donation creation
    await supabaseAdmin
      .from('audit_logs')
      .insert({
        user_id: req.user?.id,
        action: 'CREATE',
        resource_type: 'DONATION',
        resource_id: donation.id,
        details: {
          donation_type,
          amount,
          reference: reference,
          is_anonymous
        }
      });

    res.status(201).json({ success: true, data: donation });
  } catch (error) {
    console.error('Create donation error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get user's donation history (authenticated users)
router.get('/my-donations', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { limit = 20, offset = 0, status } = req.query;
    const userId = req.user?.id;

    let query = supabaseAdmin
      .from('donations')
      .select('*')
      .eq('donor_id', userId)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    query = query.range(Number(offset), Number(offset) + Number(limit) - 1);

    const { data: donations, error } = await query;

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    res.json({ success: true, data: donations });
  } catch (error) {
    console.error('Get user donations error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get all donations (Admin/Imam/Pengurus only)
router.get('/', authenticateToken, authorizeRoles('Admin', 'Imam', 'Pengurus'), async (req: Request, res: Response) => {
  try {
    const { limit = 50, offset = 0, status, donation_type, start_date, end_date } = req.query;

    let query = supabaseAdmin
      .from('donations')
      .select(`
        *,
        users!donor_id(
          display_name,
          email
        )
      `)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    if (donation_type) {
      query = query.eq('donation_type', donation_type);
    }

    if (start_date) {
      query = query.gte('created_at', start_date);
    }

    if (end_date) {
      query = query.lte('created_at', end_date);
    }

    query = query.range(Number(offset), Number(offset) + Number(limit) - 1);

    const { data: donations, error } = await query;

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    // Hide donor info for anonymous donations
    const sanitizedDonations = donations?.map(donation => ({
      ...donation,
      users: donation.is_anonymous ? null : donation.users
    }));

    res.json({ success: true, data: sanitizedDonations });
  } catch (error) {
    console.error('Get donations error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Update donation status (Admin/Imam/Pengurus only)
router.put('/:id/status', authenticateToken, authorizeRoles('Admin', 'Imam', 'Pengurus'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const validStatuses = ['Pending', 'Completed', 'Failed', 'Cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status'
      });
    }

    const updateData: any = {
      status,
      updated_at: new Date().toISOString()
    };

    if (status === 'Completed') {
      updateData.completed_at = new Date().toISOString();
    }

    if (notes) {
      updateData.admin_notes = notes.trim();
    }

    const { data: donation, error } = await supabaseAdmin
      .from('donations')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    // Log status update
    await supabaseAdmin
      .from('audit_logs')
      .insert({
        user_id: req.user?.id,
        action: 'UPDATE',
        resource_type: 'DONATION',
        resource_id: donation.id,
        details: {
          old_status: 'previous_status', // You might want to fetch this
          new_status: status,
          notes
        }
      });

    res.json({ success: true, data: donation });
  } catch (error) {
    console.error('Update donation status error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Payment callback (webhook from payment gateway)
router.post('/callback', async (req: Request, res: Response) => {
  try {
    const { reference, status, transaction_id, amount } = req.body;

    // Verify the callback (implement signature verification in production)
    // const isValid = verifyPaymentSignature(req.body, req.headers);
    // if (!isValid) {
    //   return res.status(400).json({ success: false, error: 'Invalid signature' });
    // }

    // Find donation by reference
    const { data: donation, error: findError } = await supabaseAdmin
      .from('donations')
      .select('*')
      .eq('reference_number', reference)
      .single();

    if (findError || !donation) {
      return res.status(404).json({ success: false, error: 'Donation not found' });
    }

    // Update donation status
    const updateData: any = {
      status: status === 'success' ? 'Completed' : 'Failed',
      transaction_id,
      updated_at: new Date().toISOString()
    };

    if (status === 'success') {
      updateData.completed_at = new Date().toISOString();
    }

    const { error: updateError } = await supabaseAdmin
      .from('donations')
      .update(updateData)
      .eq('id', donation.id);

    if (updateError) {
      console.error('Update donation error:', updateError);
      return res.status(500).json({ success: false, error: 'Update failed' });
    }

    // Log payment callback
    await supabaseAdmin
      .from('audit_logs')
      .insert({
        user_id: donation.donor_id,
        action: 'PAYMENT_CALLBACK',
        resource_type: 'DONATION',
        resource_id: donation.id,
        details: {
          reference,
          status,
          transaction_id,
          amount
        }
      });

    res.json({ success: true, message: 'Payment processed' });
  } catch (error) {
    console.error('Payment callback error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;