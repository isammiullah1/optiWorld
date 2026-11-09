import sgMail from '@sendgrid/mail';

import { getEnv } from '../config/env.js';
import { logger } from '../lib/logger.js';

export type PasswordResetMail = {
  to: string;
  resetUrl: string;
  recipientName: string;
};

export type OrganisationInviteMail = {
  to: string;
  inviteUrl: string;
  organisationName: string;
};

export type Mailer = {
  sendPasswordReset(message: PasswordResetMail): Promise<void>;
  sendOrganisationInvite(message: OrganisationInviteMail): Promise<boolean>;
};

export function createSendGridMailer(): Mailer {
  return {
    async sendPasswordReset({ to, resetUrl, recipientName }) {
      const env = getEnv();
      if (!env.SENDGRID_API_KEY || !env.SENDGRID_FROM_EMAIL) {
        logger.warn('Password reset email skipped because SendGrid is not configured');
        return;
      }

      sgMail.setApiKey(env.SENDGRID_API_KEY);
      await sgMail.send({
        to,
        from: env.SENDGRID_FROM_EMAIL,
        subject: 'Reset your OptiWorld password',
        text: [
          `Hello ${recipientName},`,
          '',
          'OptiWorld received a request to reset your password.',
          'This link expires in 1 hour:',
          resetUrl,
          '',
          'If you did not request this, you can ignore this email.',
        ].join('\n'),
      });
    },
    async sendOrganisationInvite({ to, inviteUrl, organisationName }) {
      const env = getEnv();
      if (!env.SENDGRID_API_KEY || !env.SENDGRID_FROM_EMAIL) {
        logger.warn('Organisation invite skipped because SendGrid is not configured');
        return false;
      }

      sgMail.setApiKey(env.SENDGRID_API_KEY);
      await sgMail.send({
        to,
        from: env.SENDGRID_FROM_EMAIL,
        subject: `Join ${organisationName} on OptiWorld`,
        text: [
          `You have been invited to ${organisationName} on OptiWorld.`,
          'This one-time link expires in 7 days:',
          inviteUrl,
          '',
          'Open the link to set your name and password.',
        ].join('\n'),
      });
      return true;
    },
  };
}
