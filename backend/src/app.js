require('dotenv').config();
if (!process.env.TZ) process.env.TZ = 'Asia/Ho_Chi_Minh';
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const ttlCache = require('./utils/ttlCache');
const { authLimiter, adminLimiter, excelLimiter } = require('./middlewares/rateLimits');
const swaggerUi = require('swagger-ui-express');
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
const tilesRoutes = require('./routes/tiles');
const apiConfigRoutes = require('./routes/apiConfigs');
const fieldMappingRoutes = require('./routes/fieldMappings');
const queueLogsRoutes = require('./routes/queueLogs');
const externalUsersRoutes = require('./routes/externalUsers');
const notificationsRoutes = require('./routes/notifications');
const oneOfficeSyncRoutes = require('./routes/oneOfficeSync');
const geocodeRoutes = require('./routes/geocode');
const adminGeocodeConfigRoutes = require('./routes/adminGeocodeConfig');
const webhooksRoutes = require('./routes/webhooks');
const proposalActivityRoutes = require('./routes/proposalActivity');
const webhookConfigsRoutes = require('./routes/webhookConfigs');
const lifecycleConfigRoutes = require('./routes/lifecycleConfig');
const helpPublicRoutes = require('./routes/helpPublic');
const adminHelpRoutes = require('./routes/adminHelp');
const adminAssistantRoutes = require('./routes/adminAssistant');
const adminDocumentsRoutes = require('./routes/adminDocuments');
const adminHelpVideosRoutes = require('./routes/adminHelpVideos');
const assistantRoutes = require('./routes/assistant');
const queueWorker = require('./workers/queueWorker');
const personnelSyncWorker = require('./workers/personnelSyncWorker');
const proposalLifecycleWorker = require('./workers/proposalLifecycleWorker');

const app = express();
app.set('trust proxy', 1);
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

// 3b. Nén response (giảm mạnh payload lớn như data list)
app.use(compression());

// 3c. Xoá cache cấu hình khi có thao tác ghi (admin sửa field/form/view/data list)
app.use((req, res, next) => {
  if (req.method !== 'GET') {
    if (/^\/api\/(field-definitions|forms|views)/.test(req.path)) {
      ttlCache.delPrefix('fielddefs:');
      ttlCache.delPrefix('formcfg:');
      ttlCache.delPrefix('viewcfg:');
    }
    if (/^\/api\/admin\/data-lists/.test(req.path)) {
      ttlCache.delPrefix('datalist:');
    }
  }
  next();
});

// 4. Rate Limiters (xem middlewares/rateLimits.js)

// Swagger UI
if (process.env.ENABLE_SWAGGER !== 'false') {
  const swaggerSpec = require('./config/swagger');
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Station Management API Docs'
  }));

  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
}

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
app.use('/api/admin/api-configs', adminLimiter, apiConfigRoutes);
app.use('/api/admin/field-mappings', adminLimiter, fieldMappingRoutes);
app.use('/api/admin/queue-logs', adminLimiter, queueLogsRoutes);
app.use('/api/admin/external-users', adminLimiter, externalUsersRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/admin/1office', adminLimiter, oneOfficeSyncRoutes);
app.use('/api/geocode', geocodeRoutes);
app.use('/api/admin/geocode-config', adminLimiter, adminGeocodeConfigRoutes);
app.use('/api/webhooks', webhooksRoutes);
app.use('/api/admin/proposal-logs', adminLimiter, proposalActivityRoutes);
app.use('/api/admin/webhook-configs', adminLimiter, webhookConfigsRoutes);
app.use('/api/admin/lifecycle-config', adminLimiter, lifecycleConfigRoutes);
app.use('/api/help', helpPublicRoutes);
app.use('/api/admin/help', adminLimiter, adminHelpRoutes);
app.use('/api/admin/help/videos', adminLimiter, adminHelpVideosRoutes);
app.use('/api/admin/assistant', adminLimiter, adminAssistantRoutes);
app.use('/api/admin/documents', adminLimiter, adminDocumentsRoutes);
app.use('/api/assistant', assistantRoutes);
app.use('/tiles', tilesRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Swagger UI: http://localhost:${PORT}/api-docs`);
  queueWorker.start().catch((err) => {
    console.error('[QueueWorker] start error:', err.message);
  });
  personnelSyncWorker.start().catch((err) => {
    console.error('[PersonnelSync] start error:', err.message);
  });
  proposalLifecycleWorker.start().catch((err) => {
    console.error('[LifecycleWorker] start error:', err.message);
  });
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
