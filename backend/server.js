const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Initialize database
const db = require('./database/db');

const app = express();
const PORT = process.env.PORT || 5000;
const frontendPath = path.join(__dirname, '../frontend');

// Security Middlewares
app.use(cors());
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://cdn.jsdelivr.net",
          "https://kit.fontawesome.com",
          "https://ka-f.fontawesome.com"
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://cdn.jsdelivr.net",
          "https://fonts.googleapis.com",
          "https://use.fontawesome.com"
        ],
        fontSrc: [
          "'self'",
          "https://fonts.gstatic.com",
          "https://ka-f.fontawesome.com",
          "https://use.fontawesome.com"
        ],
        imgSrc: ["'self'", "data:", "https://*"],
        connectSrc: [
          "'self'",
          "https://ka-f.fontawesome.com",
          "https://speed.cloudflare.com",
          "https://ipapi.co",
          "https://ipinfo.io",
          "https://extreme-ip-lookup.com",
          "https://api.db-ip.com"
        ],
        mediaSrc: ["'self'", "https://assets.mixkit.co", "https://*"],
      },
    },
  })
);

// Body Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/healthz', (req, res) => {
  const mongoState = db.mongoose.connection.readyState;
  res.status(200).json({
    status: 'ok',
    database: mongoState === 1 ? 'connected' : 'connecting'
  });
});

// Serve frontend static files
app.use(express.static(frontendPath, {
  setHeaders: (res, path) => {
    if (path.endsWith('.html') || path.endsWith('.js') || path.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// Routes
const authRoutes = require('./routes/authRoutes');
const studentRoutes = require('./routes/studentRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/students', studentRoutes);

// Fallback to index.html for single-page routing if needed
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  if (err.name === 'MulterError' || err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ message: 'File is too large. Maximum size allowed is 10MB.' });
  }
  console.error('Unhandled error:', err.stack);
  res.status(500).json({ message: 'Something went wrong on the server.' });
});

app.listen(PORT, () => {
  console.log(`PrimeNet Backend server is running on port ${PORT}`);
});
