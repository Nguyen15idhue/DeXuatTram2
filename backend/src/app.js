require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const testRoutes = require('./routes/test');
const authRoutes = require('./routes/auth');
const stationsRoutes = require('./routes/stations');
const proposalsRoutes = require('./routes/proposals');
const adminProposalsRoutes = require('./routes/adminProposals');
const myProposalsRoutes = require('./routes/myProposals');
const adminUsersRoutes = require('./routes/adminUsers');
const excelRoutes = require('./routes/excel');
const mapUtilsRoutes = require('./routes/mapUtils');
const dashboardRoutes = require('./routes/dashboard');

const app = express();
const PORT = process.env.PORT || 3000;

const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:3000'];

app.use(cors({
  origin: corsOrigins,
  credentials: true
}));
app.use(express.json());

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 10 : 30,
  message: { success: false, message: 'Quá nhiều yêu cầu, vui lòng thử lại sau' },
  standardHeaders: true,
  legacyHeaders: false
});

// Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Station Management API Docs'
}));

// Swagger JSON
app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// Routes
app.use('/api', testRoutes);
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/stations', stationsRoutes);
app.use('/api/proposals', proposalsRoutes);
app.use('/api/admin/proposals', adminProposalsRoutes);
app.use('/api/my-proposals', myProposalsRoutes);
app.use('/api/admin/users', adminUsersRoutes);
app.use('/api/admin/excel', excelRoutes);
app.use('/api/admin/dashboard', dashboardRoutes);
app.use('/api/map', mapUtilsRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Swagger UI: http://localhost:${PORT}/api-docs`);
});

module.exports = app;
