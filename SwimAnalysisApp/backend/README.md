# Swimming Stroke Recognition API

Node.js backend with MongoDB for the Swimming Stroke Recognition mobile app.

## Features

✅ User authentication (JWT)  
✅ Session management  
✅ Stroke classification storage  
✅ Efficiency score calculation  
✅ Analytics & statistics  
✅ Real-time stroke tracking

## Quick Start

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Configure Environment Variables

Create `.env` file in backend directory:

```bash
cp .env.example .env
```

Update `.env` with your MongoDB connection string:

```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/swimming-app?retryWrites=true&w=majority
JWT_SECRET=your-secret-key-generate-with-openssl
PORT=3000
NODE_ENV=development
```

**Generate JWT Secret:**

```bash
openssl rand -base64 32
```

### 3. Start Server

```bash
# Development mode (with auto-restart)
npm run dev

# Production mode
npm start
```

Server runs on `http://localhost:3000`

## API Endpoints

### Authentication

```bash
# Register new user
POST /api/auth/register
Body: { "username": "john", "email": "john@example.com", "password": "secret123" }

# Login
POST /api/auth/login
Body: { "email": "john@example.com", "password": "secret123" }

# Get current user
GET /api/auth/me
Headers: { "Authorization": "Bearer <token>" }

# Update profile
PUT /api/auth/update
Headers: { "Authorization": "Bearer <token>" }
Body: { "profile": { "firstName": "John", "age": 25 }, "goals": { "targetDistance": 1000 } }
```

### Sessions

```bash
# Create new session
POST /api/sessions
Headers: { "Authorization": "Bearer <token>" }
Body: {
  "duration": 1800,
  "strokes": [
    {
      "type": "Freestyle",
      "confidence": 0.95,
      "timestamp": "2024-02-02T10:00:00Z"
    }
  ]
}

# Get all sessions
GET /api/sessions?limit=20&skip=0
Headers: { "Authorization": "Bearer <token>" }

# Get specific session
GET /api/sessions/:id
Headers: { "Authorization": "Bearer <token>" }

# Update session
PUT /api/sessions/:id
Headers: { "Authorization": "Bearer <token>" }
Body: { "notes": "Great workout!", "tags": ["training", "freestyle"] }

# Delete session
DELETE /api/sessions/:id
Headers: { "Authorization": "Bearer <token>" }

# Add strokes to active session (real-time)
POST /api/sessions/:id/strokes
Headers: { "Authorization": "Bearer <token>" }
Body: { "strokes": [{ "type": "Freestyle", "confidence": 0.92 }] }

# Get analytics
GET /api/sessions/analytics/summary?days=30
Headers: { "Authorization": "Bearer <token>" }
```

## Data Models

### User Schema

- username, email, password
- profile (firstName, lastName, age, weight, height, experienceLevel, avatar)
- goals (targetDistance, targetTime, preferredStroke)
- statistics (totalSessions, totalStrokes, averageEfficiency, etc.)
- devices array

### Session Schema

- userId (ref to User)
- startTime, endTime, duration
- strokes array (type, confidence, timestamp, sensorData, features)
- summary (totalStrokes, strokeCounts, averageConfidence, dominantStroke)
- efficiency (score, workInput, workOutput, level, feedback)
- technique (frontPOV, topPOV, sidePOV quality assessments)
- environment (location, poolLength, temperature)
- device info

## Testing API

### Using cURL

```bash
# Register
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"swimmer1","email":"swimmer1@test.com","password":"password123"}'

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"swimmer1@test.com","password":"password123"}'

# Get sessions (replace TOKEN)
curl http://localhost:3000/api/sessions \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Using Postman

1. Import the API endpoints
2. Set up environment variables for `baseUrl` and `token`
3. Use Collections to organize requests

## Connecting from React Native App

Update your app's API service:

```javascript
// services/api.js
import axios from "axios";

const API_URL = "http://localhost:3000/api";
// For physical device: Use your computer's IP
// const API_URL = 'http://192.168.1.X:3000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Add token to requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

export default api;
```

## Project Structure

```
backend/
├── src/
│   ├── config/
│   │   └── database.js         # MongoDB connection
│   ├── models/
│   │   ├── User.js             # User schema
│   │   └── Session.js          # Session schema
│   ├── controllers/
│   │   ├── authController.js   # Auth logic
│   │   └── sessionController.js # Session logic
│   ├── routes/
│   │   ├── auth.js             # Auth routes
│   │   └── sessions.js         # Session routes
│   ├── middleware/
│   │   └── auth.js             # JWT middleware
│   └── server.js               # Express app
├── .env                        # Environment variables
├── .env.example                # Template
├── package.json
└── README.md
```

## MongoDB Setup

1. Create account at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create new cluster
3. Add database user (Database Access)
4. Whitelist IP address (Network Access) - use `0.0.0.0/0` for development
5. Get connection string from "Connect" → "Connect your application"
6. Add to `.env` as `MONGODB_URI`

## Deployment

### Option 1: Heroku

```bash
heroku create swim-api
heroku config:set MONGODB_URI="your-connection-string"
heroku config:set JWT_SECRET="your-secret"
git push heroku main
```

### Option 2: Railway

```bash
railway login
railway init
railway add
railway up
```

### Option 3: Render

1. Connect GitHub repo
2. Set environment variables in dashboard
3. Deploy automatically

## Security Considerations

✅ JWT authentication  
✅ Password hashing (bcrypt)  
✅ Helmet.js security headers  
✅ CORS configuration  
✅ Input validation  
✅ Rate limiting (recommended)  
✅ Request size limits

## Troubleshooting

**Can't connect to MongoDB:**

- Check connection string format
- Verify database user credentials
- Whitelist IP address in MongoDB Atlas
- Check network connectivity

**JWT errors:**

- Verify JWT_SECRET is set
- Check token expiration
- Ensure Bearer token format in Authorization header

**Port already in use:**

```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9
```

## Next Steps

1. ✅ Backend is running
2. Connect React Native app to API
3. Test authentication flow
4. Implement session tracking
5. Add real-time stroke updates
6. Deploy to cloud

## Support

For issues or questions, refer to the main [IMPLEMENTATION_GUIDE.md](../IMPLEMENTATION_GUIDE.md)
