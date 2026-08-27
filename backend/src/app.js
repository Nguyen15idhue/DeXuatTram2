require('dotenv').config();
const express = require('express');
const cors = require('cors');
const testRoutes = require('./routes/test');
const authRoutes = require('./routes/auth');
const stationsRoutes = require('./routes/stations');
const proposalsRoutes = require('./routes/proposals');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api', testRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/stations', stationsRoutes);
app.use('/api/proposals', proposalsRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
