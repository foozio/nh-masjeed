/**
 * Authentication middleware and utilities
 */
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { supabaseAdmin } from '../lib/supabase.js';

// User interface is defined in api/types/express.d.ts

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

/**
 * Generate JWT token
 */
export const generateToken = (payload: any): string => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
};

/**
 * Verify JWT token
 */
export const verifyToken = (token: string): any => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    throw new Error('Invalid token');
  }
};

/**
 * Authentication middleware
 */
export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      res.status(401).json({ success: false, error: 'Access token required' });
      return;
    }

    const decoded = verifyToken(token);
    
    // Get user details from database
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select(`
        id,
        email,
        display_name,
        user_roles!inner(
          role_name,
          is_active
        )
      `)
      .eq('id', decoded.userId)
      .eq('is_active', true)
      .eq('user_roles.is_active', true)
      .single();

    if (error || !user) {
      res.status(401).json({ success: false, error: 'Invalid user' });
      return;
    }

    req.user = {
      id: user.id,
      email: user.email,
      display_name: user.display_name,
      role: user.user_roles[0]?.role_name || 'Jamaah'
    };

    next();
  } catch (error) {
    res.status(401).json({ success: false, error: 'Invalid token' });
  }
};

/**
 * Role-based authorization middleware
 */
export const authorizeRoles = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ 
        success: false, 
        error: 'Insufficient permissions' 
      });
      return;
    }

    next();
  };
};

/**
 * Optional authentication middleware (doesn't fail if no token)
 */
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = verifyToken(token);
      
      const { data: user } = await supabaseAdmin
        .from('users')
        .select(`
          id,
          email,
          display_name,
          user_roles!inner(
            role_name,
            is_active
          )
        `)
        .eq('id', decoded.userId)
        .eq('is_active', true)
        .eq('user_roles.is_active', true)
        .single();

      if (user) {
        req.user = {
          id: user.id,
          email: user.email,
          display_name: user.display_name,
          role: user.user_roles[0]?.role_name || 'Jamaah'
        };
      }
    }

    next();
  } catch (error) {
    // Continue without user if token is invalid
    next();
  }
};