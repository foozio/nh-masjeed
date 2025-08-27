/**
 * Express type extensions
 */
declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      role: string;
      display_name: string;
      avatar_url?: string;
    }

    interface Request {
      user?: User;
    }
  }
}

export {};