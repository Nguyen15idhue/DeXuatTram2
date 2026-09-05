require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { authLimiter, adminLimiter, excelLimiter } = require('./middlewares/rateLimits');
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
const fieldDefinitionsRoutes = require('./routes/fieldDefinitions');
const formsRoutes = require('./routes/forms');
const formFieldsRoutes = require('./routes/formFields');
const viewsRoutes = require('./routes/views');
const viewFieldsRoutes = require('./routes/viewFields');
const dynamicEngineRoutes = require('./routes/dynamicEngine');
const filesRoutes = require('./routes/files');
const dataListsRoutes = require('./routes/dataLists');
const dataListsPublicRoutes = require('./routes/dataListsPublic');
const formulasRoutes = require('./routes/formulas');
const mapConfigsRoutes = require('./routes/mapConfigs');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. Helmet — Security Headers
app.use(helmet());

// 2. CORS
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:3000'];

app.use(cors({
  origin: corsOrigins,
  credentials: true
}));

// 3. Body parser với size limit — Chống payload attacks
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 4. Rate Limiters (xem middlewares/rateLimits.js)

// Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Station Management API Docs'
}));

app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// Routes
app.use('/api', testRoutes);
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/stations', stationsRoutes);
app.use('/api/proposals', proposalsRoutes);
app.use('/api/admin/proposals', adminLimiter, adminProposalsRoutes);
app.use('/api/my-proposals', myProposalsRoutes);
app.use('/api/admin/users', adminLimiter, adminUsersRoutes);
app.use('/api/admin/excel', adminLimiter, excelLimiter, excelRoutes);
app.use('/api/admin/dashboard', adminLimiter, dashboardRoutes);
app.use('/api/map', mapUtilsRoutes);
app.use('/api/field-definitions', fieldDefinitionsRoutes);
app.use('/api/forms', formsRoutes);
app.use('/api/forms', formFieldsRoutes);
app.use('/api/views', viewsRoutes);
app.use('/api/views', viewFieldsRoutes);
app.use('/api/dynamic', dynamicEngineRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/admin/data-lists', adminLimiter, dataListsRoutes);
app.use('/api/data-lists', dataListsPublicRoutes);
app.use('/api/formulas', formulasRoutes);
app.use('/api/map-configs', mapConfigsRoutes);

// Static file serving for uploads
const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, '../storage/uploads'), {
  setHeaders: (res, filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    const textExts = ['.txt', '.csv', '.json', '.xml', '.md', '.log', '.css', '.js', '.html', '.htm'];
    if (textExts.includes(ext)) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    }
    if (ext === '.svg') {
      res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    }
    if (ext === '.pdf') {
      res.setHeader('Content-Type', 'application/pdf; charset=utf-8');
    }
  }
}));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Swagger UI: http://localhost:${PORT}/api-docs`);
});

const fileService = require('./services/fileService');
const formulaService = require('./services/formulaService');
const runOrphanCleanup = async () => {
  try {
    const ttl = Number(process.env.ORPHAN_FILE_TTL_HOURS) || 24;
    const result = await fileService.cleanupOrphanGuestFiles(ttl);
    if (result.deleted > 0) console.log(`Orphan guest files cleaned: ${result.deleted}`);
  } catch (err) {
    console.error('Orphan cleanup error:', err.message);
  }
};
runOrphanCleanup();
setInterval(runOrphanCleanup, 24 * 60 * 60 * 1000);

const runSequenceReconcile = async () => {
  try {
    const result = await formulaService.reconcileSequences();
    if (result.prefixes > 0) console.log(`Sequences reconciled: ${result.prefixes} prefixes`);
  } catch (err) {
    console.error('Sequence reconcile error:', err.message);
  }
};
runSequenceReconcile();

module.exports = app;
