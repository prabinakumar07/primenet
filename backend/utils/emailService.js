const Setting = require('../database/db').Setting;

const appUrl = (process.env.APP_URL || 'http://localhost:5000').replace(/\/$/, '');

// Send email using Brevo Transactional Email REST API
const sendEmail = async (payload) => {
  const apiKey = (process.env.BREVO_API_KEY || '').trim();
  
  if (!apiKey || apiKey.toLowerCase() === 'none' || apiKey.includes('placeholder')) {
    console.warn('[Email Service] Brevo API Key is not configured. Skipping email sending.');
    return null;
  }

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-key': apiKey
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || `HTTP ${response.status}`);
    }
    console.log('[Email Service] Email sent successfully:', data.messageId || data);
    return data;
  } catch (err) {
    console.error('[Email Service] Failed to send email via Brevo:', err.message);
    return null;
  }
};

// Fetch admin contact configurations from DB (sender / admin fallback details)
const getContactConfig = async () => {
  try {
    const contactSetting = await Setting.findOne({ key: 'contact_info' });
    if (contactSetting && contactSetting.value) {
      return contactSetting.value;
    }
  } catch (e) {
    console.error('[Email Service] Error fetching contact settings:', e.message);
  }
  return {
    phone: '+91 98765 43210',
    email: 'support@primenet.local',
    instagram: 'https://instagram.com/primenet',
    facebook: 'https://facebook.com/primenet',
    youtube: 'https://youtube.com/primenet'
  };
};

/**
 * Sends a confirmation email to the student once their connection request is approved.
 */
exports.sendStudentApprovalEmail = async (student) => {
  const contact = await getContactConfig();
  const senderEmail = (process.env.BREVO_SENDER_EMAIL || contact.email || 'support@primenet.local').trim();
  const senderName = (process.env.BREVO_SENDER_NAME || 'PrimeNet Admin').trim();

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background-color: #f8fafc;
          margin: 0;
          padding: 20px;
          color: #334155;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background: #ffffff;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -4px rgba(0, 0, 0, 0.05);
          border: 1px solid #e2e8f0;
        }
        .header {
          background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
          color: #ffffff;
          padding: 40px 20px;
          text-align: center;
        }
        .header h1 {
          margin: 0;
          font-size: 24px;
          font-weight: 700;
          letter-spacing: 0.5px;
        }
        .logo-circle {
          width: 60px;
          height: 60px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 15px;
          font-size: 28px;
        }
        .content {
          padding: 30px 25px;
          line-height: 1.6;
        }
        .greeting {
          font-size: 18px;
          font-weight: 600;
          margin-top: 0;
          color: #1e293b;
        }
        .details-card {
          background: #f1f5f9;
          border-radius: 12px;
          padding: 20px;
          margin: 25px 0;
          border-left: 4px solid #3b82f6;
        }
        .details-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 10px;
          font-size: 14px;
        }
        .details-row:last-child {
          margin-bottom: 0;
        }
        .details-label {
          font-weight: 600;
          color: #475569;
        }
        .details-value {
          color: #0f172a;
          font-family: monospace;
          font-weight: bold;
        }
        .steps {
          margin-top: 25px;
        }
        .step-item {
          display: flex;
          margin-bottom: 15px;
        }
        .step-number {
          background: #3b82f6;
          color: #ffffff;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: bold;
          margin-right: 12px;
          flex-shrink: 0;
        }
        .step-text {
          font-size: 14px;
          color: #334155;
          margin: 0;
        }
        .footer {
          background: #f8fafc;
          padding: 25px;
          text-align: center;
          font-size: 12px;
          color: #64748b;
          border-top: 1px solid #e2e8f0;
        }
        .footer a {
          color: #3b82f6;
          text-decoration: none;
          margin: 0 10px;
        }
        .footer p {
          margin: 5px 0;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo-circle">🌐</div>
          <h1>PrimeNet Broadband</h1>
          <p style="margin: 5px 0 0 0; opacity: 0.9;">Hostel Internet Management System</p>
        </div>
        <div class="content">
          <p class="greeting">Hello ${student.name},</p>
          <p>We are excited to inform you that your registration request for a high-speed broadband connection has been <strong>approved</strong> by the hostel administration!</p>
          
          <div class="details-card">
            <div class="details-row">
              <span class="details-label">Room Number:</span>
              <span class="details-value">${student.room_number}</span>
            </div>
            <div class="details-row">
              <span class="details-label">Room Type:</span>
              <span class="details-value">Type ${student.room_type} (${student.room_type === 'A' ? 'Single' : 'Shared'})</span>
            </div>
            <div class="details-row">
              <span class="details-label">Registered MAC Address:</span>
              <span class="details-value">${student.mac_address}</span>
            </div>
            <div class="details-row">
              <span class="details-label">Connection Status:</span>
              <span class="details-value" style="color: #10b981;">Active / Enabled</span>
            </div>
          </div>

          <div class="steps">
            <h3 style="margin-top: 0; font-size: 16px; color: #1e293b;">How to get started:</h3>
            
            <div class="step-item">
              <span class="step-number">1</span>
              <p class="step-text">Connect your device to the hostel's primary local Wi-Fi router / LAN line.</p>
            </div>
            
            <div class="step-item">
              <span class="step-number">2</span>
              <p class="step-text">Ensure the physical MAC Address of your connected interface matches the registered address above.</p>
            </div>
            
            <div class="step-item">
              <span class="step-number">3</span>
              <p class="step-text">Open any browser, perform a test lookup, and enjoy unlimited high-speed browsing!</p>
            </div>
          </div>
        </div>
        <div class="footer">
          <p>Need support? Contact us at <strong>${contact.phone}</strong> or reply to <strong>${senderEmail}</strong>.</p>
          <p style="margin-top: 10px;">
            ${contact.instagram ? `<a href="${contact.instagram}">Instagram</a>` : ''}
            ${contact.facebook ? `<a href="${contact.facebook}">Facebook</a>` : ''}
            ${contact.youtube ? `<a href="${contact.youtube}">YouTube</a>` : ''}
          </p>
          <p style="margin-top: 15px; font-size: 10px; opacity: 0.8;">&copy; 2026 PrimeNet System. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const payload = {
    sender: {
      name: senderName,
      email: senderEmail
    },
    to: [
      {
        email: student.email,
        name: student.name
      }
    ],
    subject: `🎉 PrimeNet Connection Request Approved - Room ${student.room_number}`,
    htmlContent: htmlContent
  };

  return sendEmail(payload);
};

/**
 * Sends a warning alert email to the admin(s) when the queue of pending connection requests exceeds 8.
 */
exports.sendAdminAlertEmail = async (pendingCount, adminEmailString) => {
  const contact = await getContactConfig();
  const senderEmail = (process.env.BREVO_SENDER_EMAIL || contact.email || 'support@primenet.local').trim();
  const senderName = (process.env.BREVO_SENDER_NAME || 'PrimeNet Admin').trim();

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background-color: #fffbeb;
          margin: 0;
          padding: 20px;
          color: #334155;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background: #ffffff;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05);
          border: 1px solid #fef3c7;
        }
        .header {
          background: linear-gradient(135deg, #d97706 0%, #f59e0b 100%);
          color: #ffffff;
          padding: 30px 20px;
          text-align: center;
        }
        .header h1 {
          margin: 0;
          font-size: 22px;
          font-weight: 700;
        }
        .alert-icon {
          font-size: 36px;
          margin-bottom: 10px;
        }
        .content {
          padding: 30px 25px;
          line-height: 1.6;
        }
        .badge-warning {
          background: #fef3c7;
          color: #b45309;
          padding: 8px 16px;
          border-radius: 30px;
          font-weight: bold;
          display: inline-block;
          font-size: 14px;
          margin: 15px 0;
          border: 1px solid #fde68a;
        }
        .btn-action {
          display: inline-block;
          background: #d97706;
          color: #ffffff !important;
          text-decoration: none;
          padding: 12px 30px;
          border-radius: 8px;
          font-weight: bold;
          margin-top: 20px;
          box-shadow: 0 4px 6px -1px rgba(217, 119, 6, 0.2);
        }
        .footer {
          background: #fafaf9;
          padding: 20px;
          text-align: center;
          font-size: 12px;
          color: #78716c;
          border-top: 1px solid #f5f5f4;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="alert-icon">⚠️</div>
          <h1>Queue Capacity Alert</h1>
          <p style="margin: 5px 0 0 0; opacity: 0.9;">PrimeNet Hostel Administration</p>
        </div>
        <div class="content" style="text-align: center;">
          <p style="font-size: 16px; font-weight: 600; color: #1e293b; margin-top: 0;">Pending Approvals Queue Warning</p>
          <p>The system has detected that the number of connection requests waiting for approval has exceeded the warning threshold.</p>
          
          <div class="badge-warning">
            ${pendingCount} Pending Requests Awaiting Action
          </div>
          
          <p style="font-size: 14px; color: #64748b;">Please log in to the PrimeNet administrator panel as soon as possible to review, approve, or reject these connection requests to avoid enrollment delays.</p>
          
          <a href="${appUrl}/" class="btn-action">Open Admin Dashboard</a>
        </div>
        <div class="footer">
          <p>This is an automated system notification from the PrimeNet Local Server.</p>
          <p style="margin-top: 5px;">&copy; 2026 PrimeNet Administration</p>
        </div>
      </div>
    </body>
    </html>
  `;

  // Parse admin emails (split by comma/semicolon for multiple admin support)
  const toList = adminEmailString.split(/[,;]/).map(email => ({
    email: email.trim(),
    name: "PrimeNet Admin"
  })).filter(entry => entry.email.length > 0);

  if (toList.length === 0) {
    console.warn('[Email Service] No valid admin emails found in settings to send queue alert.');
    return null;
  }

  const payload = {
    sender: {
      name: senderName + " Automated Alert",
      email: senderEmail
    },
    to: toList,
    subject: `⚠️ Action Required: Pending Student Registrations Queue Exceeded (${pendingCount} pending)`,
    htmlContent: htmlContent
  };

  return sendEmail(payload);
};

/**
 * Sends a confirmation email to the student upon registration submission.
 */
exports.sendStudentRegistrationEmail = async (student) => {
  const contact = await getContactConfig();
  const senderEmail = (process.env.BREVO_SENDER_EMAIL || contact.email || 'support@primenet.local').trim();
  const senderName = (process.env.BREVO_SENDER_NAME || 'PrimeNet Admin').trim();

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background-color: #f8fafc;
          margin: 0;
          padding: 20px;
          color: #334155;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background: #ffffff;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -4px rgba(0, 0, 0, 0.05);
          border: 1px solid #e2e8f0;
        }
        .header {
          background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
          color: #ffffff;
          padding: 40px 20px;
          text-align: center;
        }
        .header h1 {
          margin: 0;
          font-size: 24px;
          font-weight: 700;
          letter-spacing: 0.5px;
        }
        .logo-circle {
          width: 60px;
          height: 60px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 15px;
          font-size: 28px;
        }
        .content {
          padding: 30px 25px;
          line-height: 1.6;
        }
        .greeting {
          font-size: 18px;
          font-weight: 600;
          margin-top: 0;
          color: #1e293b;
        }
        .status-badge {
          display: inline-block;
          background-color: #e0f2fe;
          color: #0369a1;
          padding: 8px 16px;
          border-radius: 9999px;
          font-weight: 600;
          font-size: 14px;
          margin: 15px 0;
        }
        .details-card {
          background: #f1f5f9;
          border-radius: 12px;
          padding: 20px;
          margin: 25px 0;
          border-left: 4px solid #0284c7;
        }
        .details-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 10px;
          font-size: 14px;
        }
        .details-row:last-child {
          margin-bottom: 0;
        }
        .details-label {
          font-weight: 600;
          color: #475569;
        }
        .details-value {
          color: #0f172a;
          font-family: monospace;
          font-weight: bold;
        }
        .footer {
          background: #f8fafc;
          padding: 25px;
          text-align: center;
          font-size: 12px;
          color: #64748b;
          border-top: 1px solid #e2e8f0;
        }
        .footer a {
          color: #3b82f6;
          text-decoration: none;
          margin: 0 10px;
        }
        .footer p {
          margin: 5px 0;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo-circle">⏳</div>
          <h1>Registration Received</h1>
          <p style="margin: 5px 0 0 0; opacity: 0.9;">PrimeNet Broadband System</p>
        </div>
        <div class="content">
          <p class="greeting">Hello ${student.name},</p>
          <p>Thank you for submitting your connection request. Your payment and verification are currently under process, and we will review them shortly.</p>
          
          <div style="text-align: center;">
            <span class="status-badge">Verification Under Process</span>
          </div>

          <div class="details-card">
            <div class="details-row">
              <span class="details-label">Registered Name:</span>
              <span class="details-value">${student.name}</span>
            </div>
            <div class="details-row">
              <span class="details-label">Room Number:</span>
              <span class="details-value">${student.room_number} (Type ${student.room_type})</span>
            </div>
            <div class="details-row">
              <span class="details-label">MAC Address:</span>
              <span class="details-value">${student.mac_address}</span>
            </div>
          </div>
          
          <p style="font-size: 14px; color: #64748b;">Once the administrator reviews and accepts your payment screenshot/request, you will receive another confirmation email with activation instructions.</p>
        </div>
        <div class="footer">
          <p>Need assistance? Contact us at <strong>${contact.phone}</strong> or reply to <strong>${senderEmail}</strong>.</p>
          <p style="margin-top: 15px; font-size: 10px; opacity: 0.8;">&copy; 2026 PrimeNet System. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const payload = {
    sender: {
      name: senderName,
      email: senderEmail
    },
    to: [
      {
        email: student.email,
        name: student.name
      }
    ],
    subject: `⏳ PrimeNet Registration Under Review - Room ${student.room_number}`,
    htmlContent: htmlContent
  };

  return sendEmail(payload);
};

/**
 * Sends a broadcast email to a student.
 */
exports.sendBroadcastEmail = async (email, name, subject, htmlBody) => {
  const contact = await getContactConfig();
  const senderEmail = (process.env.BREVO_SENDER_EMAIL || contact.email || 'support@primenet.local').trim();
  const senderName = (process.env.BREVO_SENDER_NAME || 'PrimeNet Admin').trim();

  // Convert plain text line breaks to <br> if it doesn't contain HTML tags.
  const hasHtmlTags = /<[a-z][\s\S]*>/i.test(htmlBody);
  const formattedBody = hasHtmlTags ? htmlBody : htmlBody.replace(/\n/g, '<br>');

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background-color: #f8fafc;
          margin: 0;
          padding: 20px;
          color: #334155;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background: #ffffff;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -4px rgba(0, 0, 0, 0.05);
          border: 1px solid #e2e8f0;
        }
        .header {
          background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
          color: #ffffff;
          padding: 30px 20px;
          text-align: center;
        }
        .header h1 {
          margin: 0;
          font-size: 22px;
          font-weight: 700;
        }
        .content {
          padding: 30px 25px;
          line-height: 1.6;
        }
        .greeting {
          font-size: 16px;
          font-weight: 600;
          margin-top: 0;
          color: #1e293b;
        }
        .footer {
          background: #f8fafc;
          padding: 20px;
          text-align: center;
          font-size: 12px;
          color: #64748b;
          border-top: 1px solid #e2e8f0;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>PrimeNet Announcement</h1>
        </div>
        <div class="content">
          <p class="greeting">Hello ${name},</p>
          <div>
            ${formattedBody}
          </div>
        </div>
        <div class="footer">
          <p>This is a broadcast message from the PrimeNet administrator.</p>
          <p style="margin-top: 5px; font-size: 10px; opacity: 0.8;">&copy; 2026 PrimeNet System. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const payload = {
    sender: {
      name: senderName,
      email: senderEmail
    },
    to: [
      {
        email: email,
        name: name
      }
    ],
    subject: subject,
    htmlContent: htmlContent
  };

  return sendEmail(payload);
};
