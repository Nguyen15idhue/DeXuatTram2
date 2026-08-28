require('dotenv').config();
const express = require('express');
const cors = require('cors');
const testRoutes = require('./routes/test');
const authRoutes = require('./routes/auth');
const stationsRoutes = require('./routes/stations');
const proposalsRoutes = require('./routes/proposals');
const adminProposalsRoutes = require('./routes/adminProposals');
const myProposalsRoutes = require('./routes/myProposals');
const adminUsersRoutes = require('./routes/adminUsers');
const excelRoutes = require('./routes/excel');
const mapUtilsRoutes = require('./routes/mapUtils');

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
app.use('/api/admin/proposals', adminProposalsRoutes);
app.use('/api/my-proposals', myProposalsRoutes);
app.use('/api/admin/users', adminUsersRoutes);
app.use('/api/admin/excel', excelRoutes);
app.use('/api/map', mapUtilsRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
