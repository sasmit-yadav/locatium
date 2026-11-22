/**
 * Who runs this site, for the Terms / Privacy pages and the grievance contact.
 * Set these in frontend/.env (and in Vercel) before launch:
 *   VITE_OPERATOR_NAME="Your name or company"
 *   VITE_CONTACT_EMAIL="support@yourdomain.in"
 */
export const OPERATOR_NAME = import.meta.env.VITE_OPERATOR_NAME || 'the LOCATIUM team';
export const CONTACT_EMAIL = import.meta.env.VITE_CONTACT_EMAIL || 'support@locatium.app';
export const LEGAL_UPDATED = '21 November 2026';
