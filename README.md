# PrimeNet Hostel Broadband Management System

PrimeNet is a full-stack hostel broadband management website. The Express backend serves the static frontend and exposes the API from the same Render web service.

## Project Structure

```text
primenet/
├── frontend/
│   ├── assets/              # Hero video and image assets
│   ├── index.html           # Public website and admin dashboard UI
│   ├── script.js            # Frontend API calls and dashboard behavior
│   └── style.css            # Website styles
├── backend/
│   ├── controllers/         # Auth, student, upload, settings logic
│   ├── database/            # MongoDB connection and Mongoose models
│   ├── middleware/          # JWT auth middleware
│   ├── routes/              # API route definitions
│   ├── utils/               # Email service
│   ├── .env.example         # Local environment template
│   ├── package.json         # Backend dependencies and scripts
│   └── server.js            # Express app serving frontend and API
├── package.json             # Root Render-friendly scripts
├── render.yaml              # Render blueprint
└── README.md
```

## Workflow

- Frontend files are served by Express from `frontend/`.
- API routes are available under `/api/auth` and `/api/students`.
- MongoDB stores admin users, student registrations, and site settings.
- Cloudinary stores uploaded payment screenshots and QR images.
- Brevo is optional and sends admin/student notification emails when configured.

## Local Setup

1. Install backend dependencies:

```bash
npm install --prefix backend
```

2. Create your local env file:

```bash
cp backend/.env.example backend/.env
```

3. Update `backend/.env` with your MongoDB, Cloudinary, Brevo, JWT, and admin values.

4. Start the app:

```bash
npm start
```

Open `http://localhost:5000`.

## Render Deployment

This project is prepared for one Render web service that hosts both frontend and backend.

### Option 1: Blueprint

1. Push this repository to GitHub.
2. In Render, choose **New +** → **Blueprint**.
3. Select the repo and let Render read `render.yaml`.
4. Add the required secret environment variables.

### Option 2: Manual Web Service

- Root Directory: leave empty
- Environment: `Node`
- Build Command: `npm install --prefix backend`
- Start Command: `npm start --prefix backend`
- Health Check Path: `/healthz`

### Required Render Environment Variables

```env
MONGODB_URI=your_mongodb_atlas_connection_string
JWT_SECRET=your_long_random_secret
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_secure_admin_password
APP_URL=https://your-render-service.onrender.com
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
```

### Optional Email Variables

```env
BREVO_API_KEY=your_brevo_api_key
BREVO_SENDER_EMAIL=your_verified_sender_email
BREVO_SENDER_NAME=PrimeNet
```

## Notes

- Do not commit `backend/.env`; it contains secrets.
- Use MongoDB Atlas for Render because Render web services do not include a local MongoDB server.
- Uploads require valid Cloudinary credentials because local Render disk storage is temporary.
