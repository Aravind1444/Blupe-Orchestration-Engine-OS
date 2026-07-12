// Netlify Serverless Function: Email via SMTP
// Uses nodemailer to send emails

import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';
import { requireUser } from './utils/auth.js';
import { getCorsHeaders } from './utils/cors.js';
import { enforceBilling } from './utils/billing.js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

export async function handler(event, context) {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: ''
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    // Enforce authentication
    const authResult = await requireUser(event);
    if (authResult.error) {
        return {
            statusCode: authResult.status || 401,
            headers: corsHeaders,
            body: JSON.stringify({ error: authResult.error })
        };
    }

    try {
        const body = JSON.parse(event.body || '{}');
        const { to, subject, html, text, from, smtp } = body;

        // Rate limiting check
        if (authResult.user && authResult.user.id !== 'service_role') {
            const { data: allowed, error: rateLimitError } = await supabase.rpc('check_user_rate_limit', {
                p_user_id: authResult.user.id,
                p_endpoint: 'email',
                p_max_requests: 100,
                p_window_minutes: 60
            });
            if (rateLimitError) {
                console.error('[RateLimit] Error checking rate limit in Email:', rateLimitError);
            } else if (!allowed) {
                return {
                    statusCode: 429,
                    headers: corsHeaders,
                    body: JSON.stringify({ error: 'Too many requests. Rate limit exceeded.' })
                };
            }
        }

        // Credit deduction check
        const billingResult = await enforceBilling(authResult, 'email', body);
        if (!billingResult.allowed) {
            return {
                statusCode: billingResult.statusCode || 402,
                headers: corsHeaders,
                body: JSON.stringify({ error: billingResult.error })
            };
        }

        // SMTP Configuration: User-provided OR Platform fallback
        let smtpConfig = smtp;
        
        // If no SMTP provided or incomplete, use platform environment variables
        if (!smtpConfig || !smtpConfig.host || !smtpConfig.user || !smtpConfig.pass) {
            console.log('[Netlify Function] Using platform SMTP credentials from environment');
            smtpConfig = {
                host: process.env.SMTP_HOST,
                port: process.env.SMTP_PORT || '587',
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            };
        }

        // Final validation - ensure we have credentials
        if (!smtpConfig.host || !smtpConfig.user || !smtpConfig.pass) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Missing SMTP Credentials. Please provide SMTP details or configure platform SMTP environment variables.' })
            };
        }

        const transporter = nodemailer.createTransport({
            host: smtpConfig.host,
            port: Number(smtpConfig.port) || 587,
            secure: Number(smtpConfig.port) === 465,
            auth: { user: smtpConfig.user, pass: smtpConfig.pass },
        });

        // Resend's SMTP username is the literal "resend" — not a valid sender.
        // Only fall back to smtp user when it actually looks like an address.
        const isEmailLike = (s) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.replace(/^.*<([^>]+)>.*$/, '$1'));
        const fromAddress = [from, process.env.SMTP_FROM, smtpConfig.user, 'no-reply@blupe.space'].find(isEmailLike);

        const info = await transporter.sendMail({
            from: fromAddress,
            to: Array.isArray(to) ? to.join(', ') : to,
            subject: subject,
            text: text,
            html: html,
        });

        console.log('[Netlify Function] Email Sent Successfully:', info.messageId);

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({ success: true, messageId: info.messageId })
        };

    } catch (error) {
        console.error('[Netlify Function] Email Error:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ error: error.message || 'Failed to send email via SMTP.' })
        };
    }
}
