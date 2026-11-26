# Ma trận route × middleware (baseline nhánh tta)

> Sinh tự động từ ackend/src/routes/*.js bằng regex outer.<method>('<path>', ...). Dùng để so sánh trước/sau mỗi bước tinh gọn: số dòng và cột middleware không được đổi.

| File | Method | Path | Middleware (cắt 120 ký tự) |
|---|---|---|---|
| adminAssistant.js | GET | /config | async (req, res |
| adminAssistant.js | PUT | /config | async (req, res |
| adminAssistant.js | GET | /models | async (req, res |
| adminAssistant.js | POST | /test | assistantLimiter, async (req, res |
| adminDocuments.js | GET | /templates | async (req, res |
| adminDocuments.js | POST | /templates | async (req, res |
| adminDocuments.js | GET | /templates/:id | async (req, res |
| adminDocuments.js | PUT | /templates/:id | async (req, res |
| adminDocuments.js | DELETE | /templates/:id | async (req, res |
| adminDocuments.js | GET | /constants | async (req, res |
| adminDocuments.js | PUT | /constants | async (req, res |
| adminDocuments.js | DELETE | /constants/:key | async (req, res |
| adminDocuments.js | GET | /datalists | async (req, res |
| adminDocuments.js | GET | /templates/:id/tokens | async (req, res |
| adminDocuments.js | GET | /templates/:id/preview-blank | async (req, res |
| adminDocuments.js | POST | /templates/:id/validate | async (req, res |
| adminDocuments.js | GET | /templates/:id/layout | async (req, res |
| adminDocuments.js | GET | /templates/:id/layout/preview | async (req, res |
| adminDocuments.js | POST | /templates/:id/layout/insert | async (req, res |
| adminDocuments.js | POST | /templates/:id/layout/remove | async (req, res |
| adminDocuments.js | POST | /templates/:id/layout/align | async (req, res |
| adminDocuments.js | GET | /templates/:id/versions | async (req, res |
| adminDocuments.js | POST | /templates/:id/versions/:versionId/restore | async (req, res |
| adminGeocodeConfig.js | GET | / | requireAuth, requireSuperAdmin, geocodeController.getConfig |
| adminGeocodeConfig.js | PUT | / | requireAuth, requireSuperAdmin, geocodeController.updateConfig |
| adminGeocodeConfig.js | POST | /test | requireAuth, requireSuperAdmin, geocodeController.test |
| adminHelp.js | GET | /articles | async (req, res |
| adminHelp.js | GET | /articles/search | async (req, res |
| adminHelp.js | GET | /categories | async (req, res |
| adminHelp.js | POST | /categories | async (req, res |
| adminHelp.js | POST | /import-legacy | async (req, res |
| adminHelp.js | GET | /articles/:id | async (req, res |
| adminHelp.js | POST | /articles | async (req, res |
| adminHelp.js | PUT | /articles/:id | async (req, res |
| adminHelp.js | DELETE | /articles/:id | async (req, res |
| adminHelp.js | POST | /articles/:id/publish | async (req, res |
| adminHelp.js | POST | /articles/:id/archive | async (req, res |
| adminHelpVideos.js | POST | / | requireAuth, requireSuperAdmin, videoUpload.single('file' |
| adminLeads.js | GET | /sheet-sync/status | requireAuth, requireSuperAdmin, sheetHandler(leadSheetSync.getStatus, 200 |
| adminLeads.js | POST | /sheet-sync | requireAuth, requireSuperAdmin, sheetHandler(leadSheetSync.startRun, 202 |
| adminLeads.js | GET | /assignee-options | requireAuth, requireLeadManager, adminLeadController.assigneeOptions |
| adminLeads.js | GET | /task-counts | requireAuth, requireLeadManager, adminLeadController.taskCounts |
| adminLeads.js | GET | / | requireAuth, requireLeadManager, adminLeadController.getAll |
| adminLeads.js | POST | /bulk-delete | requireAuth, requireLeadWriter, adminLeadController.bulkDelete |
| adminLeads.js | POST | /bulk-assign | requireAuth, requireLeadManager, adminLeadController.bulkAssign |
| adminLeads.js | POST | /:id/assign | requireAuth, requireLeadManager, adminLeadController.assign |
| adminLeads.js | GET | /:id/assignments | requireAuth, requireLeadManager, adminLeadController.assignments |
| adminLeads.js | POST | /:id/create-proposal | requireAuth, requireLeadManager, adminLeadController.createProposal |
| adminLeads.js | POST | /:id/save-and-create-proposal | requireAuth, requireLeadManager, (req, res, next |
| adminLeads.js | GET | /:id/journey | requireAuth, requireLeadManager, adminLeadController.journey |
| adminLeads.js | GET | /:id | requireAuth, requireLeadManager, adminLeadController.getById |
| adminLeads.js | PUT | /:id | requireAuth, requireLeadManager, validateUpdateLead, adminLeadController.update |
| adminLeads.js | DELETE | /:id | requireAuth, requireLeadWriter, adminLeadController.remove |
| adminLeads.js | POST | / | requireAuth, requireLeadWriter, validateCreateLead, adminLeadController.create |
| adminProposals.js | GET | / | requireAuth, requireProposalInfoManager, adminProposalController.getAll |
| adminProposals.js | POST | /confirm-info-batch | requireAuth, requireSuperAdmin, adminProposalController.confirmInfoBatch |
| adminProposals.js | GET | /duplicates | requireAuth, requireProposalManager, adminProposalController.duplicates |
| adminProposals.js | GET | /:id | requireAuth, requireProposalInfoManager, adminProposalController.getById |
| adminProposals.js | GET | /:id/completeness | requireAuth, requireProposalManager, adminProposalController.completeness |
| adminProposals.js | DELETE | /:id | requireAuth, requireProposalManager, adminProposalController.delete |
| adminProposals.js | PUT | /:id | requireAuth, requireProposalManager, validateUpdateProposal, adminProposalController.update |
| adminProposals.js | PUT | /:id/status | requireAuth, requireProposalManager, adminProposalController.updateStatus |
| adminProposals.js | POST | /:id/pause | requireAuth, requireProposalManager, adminProposalController.pause |
| adminProposals.js | POST | /:id/resume | requireAuth, requireProposalManager, adminProposalController.resume |
| adminProposals.js | POST | /:id/confirm-info | requireAuth, requireProposalManager, adminProposalController.confirmInfo |
| adminProposals.js | POST | /:id/reopen-info | requireAuth, requireProposalManager, adminProposalController.reopenInfo |
| adminProposals.js | POST | /:id/extend-deadline | requireAuth, requireProposalManager, adminProposalController.extendDeadline |
| adminProposals.js | GET | /:id/extend-info | requireAuth, requireProposalManager, adminProposalController.extendInfo |
| adminProposals.js | POST | /:id/convert-to-station | requireAuth, requireAdmin, adminProposalController.convertToStation |
| adminProposals.js | POST | /reports | requireAuth, requireProposalManager, adminProposalController.exportReports |
| adminReports.js | GET | /pipeline | requireAuth, requireReportViewer, adminReportController.getPipeline |
| adminReports.js | GET | /metrics | requireAuth, requireReportViewer, adminReportController.getMetrics |
| adminReports.js | GET | /lead-details | requireAuth, requireReportViewer, adminReportController.getLeadDetails |
| adminReports.js | GET | /stage-durations | requireAuth, requireReportViewer, adminReportController.getStageDurations |
| adminReports.js | POST | /export/excel | requireAuth, requireReportViewer, adminReportController.exportReportExcel |
| adminReports.js | GET | /lead/:id | requireAuth, requireReportViewer, adminReportController.getLead360 |
| adminReports.js | GET | /export/lead/:id | requireAuth, requireReportViewer, adminReportController.exportLead360 |
| adminReports.js | POST | /builder/export | requireAuth, requireReportViewer, adminReportController.exportBuilderWidget |
| adminReports.js | GET | /config | requireAuth, requireReportViewer, adminReportController.getConfig |
| adminReports.js | PUT | /config | requireAuth, requireReportConfigurator, adminReportController.updateConfig |
| adminReports.js | GET | /builder/datasets | requireAuth, requireReportViewer, adminReportController.getBuilderDatasets |
| adminReports.js | POST | /builder/preview | requireAuth, requireReportViewer, adminReportController.previewBuilderWidget |
| adminReports.js | GET | /builder/dashboards | requireAuth, requireReportViewer, adminReportController.listBuilderDashboards |
| adminReports.js | POST | /builder/dashboards | requireAuth, requireReportConfigurator, adminReportController.createBuilderDashboard |
| adminReports.js | GET | /builder/dashboards/:id | requireAuth, requireReportViewer, adminReportController.getBuilderDashboard |
| adminReports.js | PUT | /builder/dashboards/:id | requireAuth, requireReportConfigurator, adminReportController.updateBuilderDashboard |
| adminReports.js | DELETE | /builder/dashboards/:id | requireAuth, requireReportConfigurator, adminReportController.deleteBuilderDashboard |
| adminUsers.js | GET | / | requireAuth, requireUserAccountManager, adminUserController.getAll |
| adminUsers.js | GET | /options/all | requireAuth, adminUserController.getOptions |
| adminUsers.js | GET | /:id | requireAuth, requireUserAccountManager, adminUserController.getById |
| adminUsers.js | POST | / | requireAuth, requireUserAccountManager, validateCreateUser, adminUserController.create |
| adminUsers.js | PUT | /:id | requireAuth, requireUserAccountManager, validateUpdateUser, adminUserController.update |
| adminUsers.js | DELETE | /:id | requireAuth, requireUserAccountManager, adminUserController.delete |
| adminUsers.js | PATCH | /:id/lock | requireAuth, requireAdmin, adminUserController.toggleLock |
| adminUsers.js | PATCH | /:id/role | requireAuth, requireAdmin, adminUserController.changeRole |
| adminUsers.js | PATCH | /:id/password | requireAuth, requireUserAccountManager, adminUserController.changePassword |
| assistant.js | POST | /ask | assistantLimiter, optionalAuth, upload.array('files', attachments.maxFiles( |
| assistant.js | POST | /ask-stream | assistantLimiter, optionalAuth, upload.array('files', attachments.maxFiles( |
| assistant.js | GET | /status | optionalAuth, async (req, res |
| auth.js | POST | /register | validateRegister, authController.register |
| auth.js | POST | /login | validateLogin, authController.login |
| auth.js | GET | /me | requireAuth, authController.getMe |
| auth.js | PUT | /profile | requireAuth, authController.updateProfile |
| businessCalendar.js | GET | / | requireAuth, async (req, res |
| businessCalendar.js | PUT | / | requireAuth, async (req, res |
| chargingFinance.js | GET | /stations | chargingFinanceController.listStations |
| chargingFinance.js | GET | /invoices | chargingFinanceController.listInvoices |
| chargingFinance.js | POST | /stations/:stationId/invoices | chargingFinanceController.createInvoice |
| chargingFinance.js | PUT | /stations/:stationId/payment-status | chargingFinanceController.updatePaymentStatus |
| chargingStationCare.js | GET | /:id/care-logs | requireChargingStationViewer, controller.list |
| chargingStationCare.js | POST | /:id/care-logs | requireChargingStationViewer, controller.create |
| chargingStationCare.js | PUT | /care-logs/:id | requireSuperAdmin, controller.update |
| chargingStationCare.js | DELETE | /care-logs/:id | requireSuperAdmin, controller.remove |
| chargingStationCare.js | GET | /care-logs/:id/updater | requireChargingStationViewer, controller.updater |
| chargingStationDeployments.js | GET | /:id/deployments | controller.list |
| chargingStationDeployments.js | PUT | /:id/installation | controller.installation |
| chargingStationDeployments.js | PUT | /:id/acceptance | controller.acceptance |
| chargingStationDeployments.js | PUT | /:id/on-station | controller.onStation |
| chargingStationDeployments.js | POST | /:id/deployments/:deploymentId/actions | controller.update |
| chargingStations.js | GET | / | requireChargingStationViewer, chargingStationController.list |
| chargingStations.js | GET | /export | requireChargingStationViewer, excelLimiter, chargingStationController.exportExcel |
| chargingStations.js | GET | /task-counts | requireChargingStationViewer, chargingStationController.taskCounts |
| chargingStations.js | GET | /:id/delete-preview | requireSuperAdmin, chargingStationController.deletePreview |
| chargingStations.js | POST | /:id/delete | requireSuperAdmin, chargingStationController.remove |
| chargingStations.js | POST | /from-proposal/:proposalId | requireSuperAdmin, chargingStationController.createDirectFromProposal |
| chargingStations.js | GET | /:id | requireChargingStationViewer, chargingStationController.detail |
| chargingStations.js | GET | /:id/activity | requireChargingStationViewer, chargingStationController.activity |
| chargingStations.js | POST | /:id/cancel | requireChargingStationViewer, chargingStationController.cancelOnStation |
| chargingStations.js | POST | /:id/restore | requireChargingStationViewer, chargingStationController.restoreOnStation |
| chargingStations.js | PUT | /:id | requireSuperAdmin, chargingStationController.update |
| chargingStations.js | GET | /:id/commitments | requireSuperAdmin, async (req, res |
| chargingStations.js | PUT | /:id/commitments | requireSuperAdmin, async (req, res |
| chargingStations.js | POST | /:id/contract/start | requireChargingStationViewer, chargingStationController.startContract |
| chargingStations.js | POST | /:id/contract/complete | requireChargingStationViewer, chargingStationController.completeContract |
| chargingStations.js | POST | /:id/infrastructure/:type/start | requireChargingStationViewer, chargingStationController.startInfrastructure |
| chargingStations.js | POST | /:id/infrastructure/:type/complete | requireChargingStationViewer, chargingStationController.completeInfrastructure |
| chargingStations.js | POST | /:id/infrastructure/:type/status | requireChargingStationViewer, chargingStationController.updateInfrastructure |
| chargingStations.js | PUT | /:id/infrastructure-confirmation | requireChargingStationViewer, chargingStationController.updateInfrastructureConfirmation |
| chargingStations.js | POST | /:id/delivery/early-request | requireChargingStationViewer, chargingStationController.requestEarlyDelivery |
| chargingStations.js | POST | /:id/deadline/extend | requireChargingStationViewer, chargingStationController.extendDeadline |
| chargingStations.js | POST | /:id/delivery/export | requireChargingStationViewer, chargingStationController.createDeliveryExport |
| chargingStations.js | POST | /:id/delivery/confirm | requireChargingStationViewer, chargingStationController.confirmDelivery |
| chargingStations.js | POST | /:id/installation/start | requireChargingStationViewer, chargingStationController.startInstallation |
| chargingStations.js | POST | /:id/installation/complete | requireChargingStationViewer, chargingStationController.completeInstallation |
| chargingStations.js | PUT | /:id/acceptance/result | requireChargingStationViewer, chargingStationController.updateAcceptanceResult |
| chargingStations.js | GET | /acceptance/bulk/preview | requireSuperAdmin, chargingStationController.previewBulkAcceptance |
| chargingStations.js | POST | /acceptance/bulk | requireSuperAdmin, chargingStationController.executeBulkAcceptance |
| chargingStations.js | POST | /:id/configuration/complete | requireChargingStationViewer, chargingStationController.completeConfiguration |
| chargingStations.js | POST | /:id/on-station/mark-active | requireSuperAdmin, chargingStationController.markOnStationActive |
| chargingStations.js | POST | /:id/status | requireSuperAdmin, chargingStationController.changeStatus |
| chargingStations.js | PUT | /:id/acceptance | requireChargingStationViewer, chargingStationController.updateAcceptance |
| chargingStations.js | POST | /:id/acceptance-file | requireChargingStationViewer, chargingStationController.setAcceptanceFile |
| chargingStations.js | POST | /:id/acceptance-images | requireChargingStationViewer, chargingStationController.addImages |
| chargingStations.js | DELETE | /:id/acceptance-images/:fileId | requireChargingStationViewer, chargingStationController.removeImage |
| chargingStations.js | GET | /:id/committed-export-items | requireChargingStationViewer, chargingStationController.committedExportItems |
| chargingStationShipping.js | GET | /:id/fulfillment | controller.summary |
| chargingStationShipping.js | POST | /:id/shipments | controller.create |
| chargingStationShipping.js | PUT | /:id/shipments/:exportId/status | controller.status |
| chargingStationShipping.js | POST | /:id/shipments/:exportId/receive | controller.receive |
| chargingStationShipping.js | POST | /:id/shipments/:exportId/request-return | controller.requestReturn |
| chargingStationShipping.js | POST | /:id/shipments/:exportId/confirm-return | controller.confirmReturn |
| chargingStationShipping.js | POST | /:id/shipments/:exportId/fail | controller.fail |
| cmsReports.js | GET | /status | (req, res |
| cmsReports.js | POST | /run | (req, res |
| cmsReports.js | POST | /vehicles/run | async (req, res |
| crmConfig.js | GET | /config | requireAuth, requireSuperAdmin, crmConfigController.getConfig |
| crmConfig.js | POST | /sync-now | requireAuth, requireSuperAdmin, crmConfigController.syncNow |
| crmConfig.js | GET | /outbox | requireAuth, requireSuperAdmin, crmConfigController.listOutbox |
| crmConfig.js | GET | /outbox/:id | requireAuth, requireSuperAdmin, crmConfigController.getOutboxDetail |
| crmConfig.js | POST | /outbox/:id/retry | requireAuth, requireSuperAdmin, crmConfigController.retryOutbox |
| crmConfig.js | POST | /outbox/:id/cancel | requireAuth, requireSuperAdmin, crmConfigController.cancelOutbox |
| crmConfig.js | POST | /outbox/retry-all | requireAuth, requireSuperAdmin, crmConfigController.retryAllOutbox |
| crmConfig.js | POST | /test-webhook | requireAuth, requireSuperAdmin, crmConfigController.testWebhook |
| crmConfig.js | GET | /logs | requireAuth, requireSuperAdmin, crmConfigController.listLogs |
| crmConfig.js | GET | /logs/export | requireAuth, requireSuperAdmin, crmConfigController.exportLogs |
| crmConfig.js | GET | /logs/:id | requireAuth, requireSuperAdmin, crmConfigController.getLogDetail |
| crmConfig.js | POST | /full-sync | requireAuth, requireSuperAdmin, crmFullSyncController.start |
| crmConfig.js | GET | /full-sync/status | requireAuth, requireSuperAdmin, crmFullSyncController.status |
| crmConfig.js | GET | /full-sync/runs | requireAuth, requireSuperAdmin, crmFullSyncController.runs |
| crmConfig.js | POST | /full-sync/:id/resume | requireAuth, requireSuperAdmin, crmFullSyncController.resume |
| crmConfig.js | POST | /full-sync/:id/cancel | requireAuth, requireSuperAdmin, crmFullSyncController.cancel |
| crmConfig.js | GET | /full-sync/:id/export | requireAuth, requireSuperAdmin, crmFullSyncController.exportRun |
| crmPartner.js | POST | /leads | crmWebhookAuth, crmPartnerController.receiveLeads |
| customExcelExport.js | GET | /catalog | requireAuth, requireUserManager, excelLimiter, customExcelExportService.getCatalog |
| customExcelExport.js | POST | /preview | requireAuth, requireUserManager, excelLimiter, customExcelExportService.preview |
| customExcelExport.js | POST | /export | requireAuth, requireUserManager, excelLimiter, customExcelExportService.export |
| dashboard.js | GET | / | requireAuth, requireUserManager, dashboardController.getStats |
| dataLists.js | GET | / | requireAuth, requireSuperAdmin, dataListController.getAll |
| dataLists.js | GET | /:id | requireAuth, requireSuperAdmin, dataListController.getById |
| dataLists.js | POST | / | requireAuth, requireSuperAdmin, dataListController.create |
| dataLists.js | PUT | /:id | requireAuth, requireSuperAdmin, dataListController.update |
| dataLists.js | DELETE | /:id | requireAuth, requireSuperAdmin, dataListController.remove |
| dataLists.js | POST | /:id/rows | requireAuth, requireSuperAdmin, dataListController.addRows |
| dataLists.js | PUT | /:id/rows/:rowId | requireAuth, requireSuperAdmin, dataListController.updateRow |
| dataLists.js | DELETE | /:id/rows/:rowId | requireAuth, requireSuperAdmin, dataListController.deleteRow |
| dataLists.js | GET | /:id/export | requireAuth, requireSuperAdmin, excelService.exportDataList |
| dataLists.js | POST | /:id/import/preview | requireAuth, requireSuperAdmin, excelService.uploadMiddleware, excelService.importDataListPreview |
| dataLists.js | POST | /:id/import/confirm | requireAuth, requireSuperAdmin, excelService.importDataListConfirm |
| dataListsPublic.js | GET | /:id | publicDataLimiter, async (req, res |
| dataListsPublic.js | GET | /:id/children | publicDataLimiter, async (req, res |
| dynamicEngine.js | GET | /:entity/form/:formId | dynamicEngineController.getFormConfig |
| dynamicEngine.js | GET | /:entity/view/:viewId | dynamicEngineController.getViewConfig |
| dynamicEngine.js | POST | /:entity/validate | requireAuth, dynamicEngineController.validateData |
| evReports.js | GET | / | optionalAuth, evReportController.getAll |
| evReports.js | GET | /:id | optionalAuth, evReportController.getById |
| evReports.js | POST | /guest | guestSubmitLimiter, validateCreateEvReport, evReportController.createGuest |
| evReports.js | POST | /check-nearby-public | guestTrackLimiter, evReportController.checkNearbyPublic |
| evReports.js | POST | /nearby-stations | publicDataLimiter, evReportController.getNearbyStations |
| evReports.js | GET | /admin/list | requireAuth, requireUserManager, evReportController.adminList |
| evReports.js | GET | /admin/export | requireAuth, requireUserManager, adminLimiter, excelLimiter, evReportController.adminExportExcel |
| evReports.js | GET | /admin/:id | requireAuth, requireUserManager, evReportController.adminGetById |
| evReports.js | PUT | /admin/:id | requireAuth, requireUserManager, validateUpdateEvReport, evReportController.adminUpdate |
| evReports.js | DELETE | /admin/:id | requireAuth, requireUserManager, evReportController.adminDelete |
| evReports.js | POST | /admin/:id/create-proposal | requireAuth, requireUserManager, evReportController.adminCreateProposal |
| excel.js | GET | /export/stations | requireAuth, requireAdmin, adminLimiter, excelLimiter, excelService.exportStations |
| excel.js | GET | /export/station_proposals | requireAuth, requireUserManager, adminLimiter, excelLimiter, excelService.exportProposals |
| excel.js | GET | /export/users | requireAuth, requireAdmin, adminLimiter, excelLimiter, excelService.exportUsers |
| excel.js | GET | /export/leads | requireAuth, requireLeadManager, adminLimiter, excelLimiter, excelService.exportLeads |
| excel.js | GET | /export/station_proposals/by-model | requireAuth, requireUserManager, adminLimiter, excelLimiter, excelService.exportProposalsByModel |
| excel.js | GET | /template | requireAuth, requireLeadManager, adminLimiter, excelLimiter, excelService.getTemplate |
| excel.js | GET | /template/by-model | requireAuth, requireUserManager, adminLimiter, excelLimiter, excelService.getTemplateByModel |
| excel.js | GET | /views | requireAuth, (req, res, next |
| excel.js | POST | /import/preview | requireAuth, requireLeadManager, adminLimiter, excelLimiter, excelService.uploadMiddleware, excelService.importPreview |
| excel.js | POST | /import/confirm | requireAuth, requireLeadManager, adminLimiter, excelLimiter, excelService.importConfirm |
| excel.js | GET | /import/progress/:jobId | requireAuth, requireLeadManager, adminLimiter, excelService.getImportProgress |
| excel.js | GET | /import/jobs | requireAuth, requireLeadManager, adminLimiter, excelService.listImportJobs |
| excel.js | GET | /import/jobs/:id | requireAuth, requireLeadManager, adminLimiter, excelService.getImportJob |
| excel.js | POST | /import/jobs/:id/cancel | requireAuth, requireLeadManager, adminLimiter, excelService.cancelImportJob |
| excel.js | GET | /import/jobs/:id/export-success | requireAuth, requireLeadManager, adminLimiter, excelLimiter, excelService.exportImportSuccess |
| excel.js | GET | /import/jobs/:id/export-failed | requireAuth, requireLeadManager, adminLimiter, excelLimiter, excelService.exportImportFailed |
| excel.js | POST | /export/duplicates | requireAuth, requireAdmin, adminLimiter, excelLimiter, (req, res |
| fieldDefinitions.js | GET | / | requireAuth, requireSuperAdmin, fieldDefinitionController.getAll |
| fieldDefinitions.js | GET | /entity/:entity | fieldDefinitionController.getByEntity |
| fieldDefinitions.js | GET | /:id | requireAuth, requireSuperAdmin, fieldDefinitionController.getById |
| fieldDefinitions.js | POST | / | requireAuth, requireSuperAdmin, fieldDefinitionController.create |
| fieldDefinitions.js | PUT | /:id | requireAuth, requireSuperAdmin, fieldDefinitionController.update |
| fieldDefinitions.js | DELETE | /:id | requireAuth, requireSuperAdmin, fieldDefinitionController.delete |
| fieldDefinitions.js | PATCH | /:id/status | requireAuth, requireSuperAdmin, fieldDefinitionController.updateStatus |
| fieldDefinitions.js | PATCH | /:id/lock | requireAuth, requireSuperAdmin, fieldDefinitionController.updateLock |
| files.js | POST | /upload | requireAuth, upload.single('file' |
| files.js | POST | /guest-upload | guestUploadLimiter, guestUpload.single('file' |
| files.js | POST | /cleanup-orphans | requireAuth, requireAdmin, fileController.cleanupOrphans |
| files.js | GET | /:id | requireAuth, fileController.getById |
| files.js | GET | /:id/download | optionalAuth, fileController.download |
| files.js | GET | /:id/preview | optionalAuth, fileController.preview |
| files.js | GET | /:id/image | optionalAuth, async (req, res |
| files.js | DELETE | /:id | requireAuth, fileController.delete |
| formFields.js | GET | /:formId/fields | formFieldController.getFields |
| formFields.js | PUT | /:formId/fields/reorder | requireAuth, requireSuperAdmin, formFieldController.reorder |
| formFields.js | POST | /:formId/fields | requireAuth, requireSuperAdmin, formFieldController.addField |
| formFields.js | PUT | /:formId/fields/:id | requireAuth, requireSuperAdmin, formFieldController.updateField |
| formFields.js | DELETE | /:formId/fields/:id | requireAuth, requireSuperAdmin, formFieldController.deleteField |
| forms.js | GET | / | requireAuth, requireSuperAdmin, formController.getAll |
| forms.js | GET | /by-entity-purpose | formController.getByEntityAndPurpose |
| forms.js | GET | /quick-create | requireAuth, formController.getQuickCreate |
| forms.js | GET | /:id/sync-preview | requireAuth, requireSuperAdmin, formController.syncPreview |
| forms.js | POST | /:id/sync-from-create | requireAuth, requireSuperAdmin, formController.syncFromCreate |
| forms.js | GET | /:id | formController.getById |
| forms.js | POST | / | requireAuth, requireSuperAdmin, formController.create |
| forms.js | PUT | /:id | requireAuth, requireSuperAdmin, formController.update |
| forms.js | DELETE | /:id | requireAuth, requireSuperAdmin, formController.delete |
| formulas.js | POST | /validate | requireAuth, (req, res |
| formulas.js | POST | /preview | requireAuth, async (req, res |
| geocode.js | POST | /reverse | geocodeLimiter, geocodeController.reverse |
| geocode.js | POST | /search | geocodeLimiter, geocodeController.search |
| helpPublic.js | GET | /categories | publicDataLimiter, optionalAuth, async (req, res |
| helpPublic.js | GET | /articles | publicDataLimiter, optionalAuth, async (req, res |
| helpPublic.js | GET | /articles/:slug | publicDataLimiter, optionalAuth, async (req, res |
| helpPublic.js | POST | /track-view | publicDataLimiter, async (req, res |
| historicalOnImport.js | GET | /template | async (req, res |
| historicalOnImport.js | POST | /preview | receiveFile, async (req, res |
| historicalOnImport.js | POST | /confirm | receiveFile, async (req, res |
| lifecycleConfig.js | GET | / | requireAuth, lifecycleConfigController.get |
| lifecycleConfig.js | PUT | / | requireAuth, requireSuperAdmin, lifecycleConfigController.update |
| mapConfigs.js | GET | /tile-providers | mapConfigController.getTileProviders |
| mapConfigs.js | GET | / | mapConfigController.getConfig |
| mapConfigs.js | GET | /admin | requireAuth, requireSuperAdmin, mapConfigController.getAdminConfig |
| mapConfigs.js | POST | / | requireAuth, requireSuperAdmin, mapConfigController.createConfig |
| mapConfigs.js | PUT | /:id | requireAuth, requireSuperAdmin, mapConfigController.updateConfig |
| mapConfigs.js | DELETE | /:id | requireAuth, requireSuperAdmin, mapConfigController.deleteConfig |
| mapUtils.js | POST | /resolve-map-url | mapController.resolveMapUrl |
| myProposals.js | GET | /:id/report/documents | requireAuth, reportDocuments.list |
| myProposals.js | POST | /:id/report/documents/prepare | requireAuth, reportDocuments.prepare |
| myProposals.js | POST | /:id/report/documents/:documentId/convert | requireAuth, reportDocuments.convert |
| myProposals.js | GET | / | requireAuth, myProposalController.getAll |
| myProposals.js | GET | /duplicates | requireAuth, myProposalController.duplicates |
| myProposals.js | POST | /duplicates/export | requireAuth, (req, res |
| myProposals.js | PUT | /:id | requireAuth, validateUpdateProposal, myProposalController.update |
| myProposals.js | POST | /:id/report | requireAuth, myProposalController.uploadReport |
| myProposals.js | POST | /:id/confirm-info | requireAuth, myProposalController.confirmInfo |
| myProposals.js | POST | /:id/reopen-info | requireAuth, myProposalController.reopenInfo |
| myProposals.js | POST | /:id/extend-deadline | requireAuth, myProposalController.extendDeadline |
| myProposals.js | GET | /:id/extend-info | requireAuth, myProposalController.extendInfo |
| myProposals.js | DELETE | /:id | requireAuth, myProposalController.delete |
| myProposals.js | GET | /export | requireAuth, (req, res |
| notifications.js | GET | /all | requireAuth, requireAdmin, notificationController.getAllAdmin |
| notifications.js | GET | / | requireAuth, notificationController.getAll |
| notifications.js | GET | /unread-count | requireAuth, notificationController.getUnreadCount |
| notifications.js | PUT | /:id/read | requireAuth, notificationController.markRead |
| notifications.js | PUT | /read-all | requireAuth, notificationController.markAllRead |
| onStationSheetSync.js | GET | /status | requireAuth, requireAdmin, controller.status |
| onStationSheetSync.js | POST | /daily | requireAuth, requireAdmin, controller.dailySync |
| onStationSheetSync.js | POST | /cancel | requireAuth, requireAdmin, controller.cancel |
| onStationSheetSync.js | POST | /warnings/:id/resolve | requireAuth, requireAdmin, controller.resolveWarning |
| proposalActivity.js | GET | / | requireAuth, requireUserManager, proposalActivityController.getAll |
| proposalActivity.js | GET | /journey | requireAuth, requireUserManager, proposalActivityController.getJourney |
| proposalActivity.js | GET | /:proposalId/timeline | requireAuth, requireProposalInfoManager, proposalActivityController.timeline |
| proposalApprovals.js | GET | / | requireAuth, requireUserManager, proposalApprovalController.list |
| proposalApprovals.js | GET | /filter-options | requireAuth, requireUserManager, proposalApprovalController.getFilterOptions |
| proposalApprovals.js | GET | /:id | requireAuth, requireUserManager, proposalApprovalController.getProposal |
| proposalApprovals.js | PUT | /:id/tgd-reject | requireAuth, requireUserManager, proposalApprovalController.tgdReject |
| proposalApprovals.js | PUT | /:id/request-update | requireAuth, requireUserManager, proposalApprovalController.requestUpdate |
| proposalApprovals.js | GET | /:id/signature-config | requireAuth, requireUserManager, proposalApprovalController.getSignatureConfig |
| proposalApprovals.js | GET | /:id/signer-candidates | requireAuth, requireUserManager, proposalApprovalController.getSignerCandidates |
| proposalApprovals.js | PUT | /:id/signature-config | requireAuth, requireUserManager, proposalApprovalController.configureSignature |
| proposalApprovals.js | POST | /:id/signature-config/withdraw | requireAuth, requireUserManager, proposalApprovalController.withdrawSignatureConfig |
| proposalDesigns.js | GET | / | requireAuth, requireUserManager, proposalDesignController.list |
| proposalDesigns.js | GET | /filter-options | requireAuth, requireUserManager, proposalDesignController.filterOptions |
| proposalDesigns.js | GET | /:id | requireAuth, requireUserManager, proposalDesignController.detail |
| proposalDesigns.js | PUT | /:id | requireAuth, requireUserManager, proposalDesignController.update |
| proposalDesigns.js | PUT | /:id/request-supplement | requireAuth, requireUserManager, proposalDesignController.requestSupplement |
| proposalDesigns.js | PUT | /:id/cancel | requireAuth, requireUserManager, proposalDesignController.cancel |
| proposalGrading.js | GET | / | requireAuth, requireProposalInfoManager, proposalGradingController.list |
| proposalGrading.js | GET | /filter-options | requireAuth, requireProposalInfoManager, proposalGradingController.filterOptions |
| proposalGrading.js | GET | /:id | requireAuth, requireProposalInfoManager, proposalGradingController.detail |
| proposalGrading.js | PUT | /display-config | requireAuth, requireSuperAdmin, proposalGradingController.saveDisplayConfig |
| proposalGrading.js | POST | /:id/request-supplement | requireAuth, requireProposalManager, proposalGradingController.requestSupplement |
| proposalGrading.js | PUT | /:id | requireAuth, requireProposalManager, proposalGradingController.update |
| proposalReports.js | GET | / | requireAuth, requireProposalReportManager, proposalReportController.list |
| proposalReports.js | GET | /filter-options | requireAuth, requireProposalReportManager, proposalReportController.filterOptions |
| proposalReports.js | GET | /:id/documents | requireAuth, requireProposalReportManager, reportDocuments.list |
| proposalReports.js | POST | /:id/documents/prepare | requireAuth, requireProposalReportManager, reportDocuments.prepare |
| proposalReports.js | POST | /:id/documents/:documentId/convert | requireAuth, requireProposalReportManager, reportDocuments.convert |
| proposalReports.js | GET | /:id | requireAuth, requireProposalReportManager, proposalReportController.detail |
| proposalReports.js | PUT | /:id | requireAuth, requireProposalReportManager, proposalReportController.upload |
| proposalReports.js | POST | /:id/generate | requireAuth, requireProposalReportManager, proposalReportController.generate |
| proposalReports.js | GET | /:id/generation-options | requireAuth, requireProposalReportManager, proposalReportController.generationOptions |
| proposalReports.js | POST | /:id/generation-preview | requireAuth, requireProposalReportManager, proposalReportController.generationPreview |
| proposalReports.js | PUT | /:id/request-revision | requireAuth, requireProposalReportManager, proposalReportController.requestRevision |
| proposalRequests.js | GET | / | requireAuth, requireProposalInfoManager, proposalRequestController.list |
| proposalRequests.js | GET | /types | requireAuth, requireProposalInfoManager, proposalRequestController.types |
| proposalRequests.js | GET | /filter-options | requireAuth, requireProposalInfoManager, proposalRequestController.filterOptions |
| proposalRequests.js | GET | /:id/update-context | requireAuth, requireProposalInfoManager, proposalRequestController.getUpdateContext |
| proposalRequests.js | PUT | /:id/proposal | requireAuth, requireProposalInfoManager, validateUpdateProposal, proposalRequestController.updateProposalForRequest |
| proposalRequests.js | POST | /:id/complete | requireAuth, requireProposalInfoManager, proposalRequestController.complete |
| proposalReviews.js | GET | / | requireAuth, requireUserManager, proposalReviewController.list |
| proposalReviews.js | GET | /:id | requireAuth, requireUserManager, proposalReviewController.detail |
| proposalReviews.js | PUT | /:id/request-regrade | requireAuth, requireUserManager, proposalReviewController.requestRegrade |
| proposalReviews.js | PUT | /:id/to-tgd | requireAuth, requireUserManager, proposalReviewController.toTgd |
| proposalReviews.js | PUT | /:id/cancel | requireAuth, requireUserManager, proposalReviewController.cancel |
| proposalReviews.js | PUT | /:id/approve | requireAuth, requireUserManager, proposalReviewController.approve |
| proposalReviews.js | PUT | /:id/reject | requireAuth, requireUserManager, proposalReviewController.reject |
| proposals.js | GET | / | optionalVerifiedAuth, proposalController.getAll |
| proposals.js | GET | /:id | optionalVerifiedAuth, proposalController.getById |
| proposals.js | POST | / | requireAuth, validateCreateProposal, proposalController.create |
| proposals.js | POST | /check-nearby | requireAuth, proposalController.checkNearby |
| proposals.js | POST | /guest | guestSubmitLimiter, validateCreateProposal, proposalController.createGuest |
| proposals.js | POST | /check-nearby-public | guestTrackLimiter, proposalController.checkNearbyPublic |
| proposals.js | GET | /track/:code | guestTrackLimiter, proposalController.trackByCode |
| proposalSheetSync.js | GET | /status | requireAuth, requireAdmin, controller.status |
| proposalSheetSync.js | POST | /daily | requireAuth, requireAdmin, controller.dailySync |
| proposalSignatures.js | GET | / | requireAuth, proposalSignatureController.list |
| proposalSignatures.js | GET | /:id | requireAuth, proposalSignatureController.detail |
| proposalSignatures.js | POST | /:id/sign | requireAuth, proposalSignatureController.sign |
| proposalSignatures.js | POST | /:id/complete-signing | requireAuth, requireSuperAdmin, proposalSignatureController.completeSigning |
| proposalSignatures.js | POST | /:id/reject | requireAuth, proposalSignatureController.reject |
| proposalSignatures.js | POST | /:id/request-rework | requireAuth, proposalSignatureController.requestRework |
| proposalSignatures.js | POST | /:id/signed-file | requireAuth, proposalSignatureController.uploadSignedFile |
| proposalSignatures.js | GET | /:id/export | requireAuth, proposalSignatureController.exportFile |
| proposalSignatures.js | GET | /:id/signed-document | requireAuth, proposalSignatureController.downloadSignedDocument |
| proposalSignatures.js | GET | /:id/documents/:documentId/recovery | requireAuth, requireSuperAdmin, recoveryController.inspect |
| proposalSignatures.js | POST | /:id/documents/:documentId/recovery | requireAuth, requireSuperAdmin, recoveryController.create |
| proposalSignatures.js | GET | /:id/documents/:documentId/recovery/:recoveryId | requireAuth, requireSuperAdmin, recoveryController.get |
| proposalSignatures.js | PUT | /:id/documents/:documentId/recovery/:recoveryId | requireAuth, requireSuperAdmin, recoveryController.update |
| proposalSignatures.js | POST | /:id/documents/:documentId/recovery/:recoveryId/activate | requireAuth, requireSuperAdmin, recoveryController.activate |
| proposalSignatures.js | GET | /:id/documents/:documentId/recovery/:recoveryId/image/:configId | requireAuth, requireSuperAdmin, recoveryController.image |
| proposalSignatures.js | GET | /:id/chairman-files | requireAuth, proposalSignatureController.downloadChairmanFiles |
| proposalSignatures.js | GET | /:id/signature-repair/:configId | requireAuth, requireSuperAdmin, proposalSignatureController.signatureRepairStatus |
| proposalSignatures.js | POST | /:id/signature-repair/:configId | requireAuth, requireSuperAdmin, proposalSignatureController.repairSignature |
| proposalSignatures.js | GET | /:id/signature-image/:configId | requireAuth, proposalSignatureController.signatureImage |
| shippingCarriers.js | GET | / | handle((req |
| shippingCarriers.js | POST | / | handle((req |
| shippingCarriers.js | PUT | /:id | handle((req |
| shippingCarriers.js | DELETE | /:id | handle((req |
| shippingCarriers.js | PATCH | /:id/status | handle((req |
| signatures.js | GET | / | requireAuth, signatureController.getAll |
| signatures.js | GET | /check-manager | requireAuth, signatureController.checkManager |
| signatures.js | GET | /user/:userId | requireAuth, signatureController.getByUserId |
| signatures.js | GET | /:id/image | requireAuth, signatureController.getImage |
| signatures.js | POST | /upload | requireAuth, upload.single('file' |
| signatures.js | DELETE | /:id | requireAuth, signatureController.remove |
| stations.js | GET | / | optionalAuth, stationController.getAll |
| stations.js | GET | /:id | optionalAuth, stationController.getById |
| stations.js | GET | /:id/activity | requireAuth, requireUserManager, stationController.activity |
| stations.js | GET | /:id/proposal | requireAuth, requireUserManager, stationController.sourceProposal |
| stations.js | POST | / | requireAuth, requireAdmin, validateCreateStation, stationController.create |
| stations.js | PUT | /:id | requireAuth, requireAdmin, validateUpdateStation, stationController.update |
| stations.js | DELETE | /:id | requireAuth, requireAdmin, stationController.delete |
| suppliers.js | GET | / | controller.list |
| suppliers.js | POST | / | controller.create |
| suppliers.js | GET | /:id/poles | controller.poles |
| suppliers.js | POST | /sync-pole | controller.syncPoles |
| suppliers.js | POST | /:id/assign-pole | controller.assignPole |
| suppliers.js | GET | /:id | controller.detail |
| suppliers.js | PUT | /:id | controller.update |
| test.js | GET | /test | (req, res |
| tiles.js | GET | /:z/:x/:y | async (req, res |
| viewFields.js | GET | /:viewId/fields | viewFieldController.getFields |
| viewFields.js | PUT | /:viewId/fields/reorder | requireAuth, requireSuperAdmin, viewFieldController.reorder |
| viewFields.js | POST | /:viewId/fields | requireAuth, requireSuperAdmin, viewFieldController.addField |
| viewFields.js | PUT | /:viewId/fields/:id | requireAuth, requireSuperAdmin, viewFieldController.updateField |
| viewFields.js | DELETE | /:viewId/fields/:id | requireAuth, requireSuperAdmin, viewFieldController.deleteField |
| views.js | GET | / | requireAuth, viewController.getAll |
| views.js | GET | /:id | viewController.getById |
| views.js | POST | / | requireAuth, requireSuperAdmin, viewController.create |
| views.js | PUT | /:id | requireAuth, requireSuperAdmin, viewController.update |
| views.js | DELETE | /:id | requireAuth, requireSuperAdmin, viewController.delete |
| warehouse.js | GET | /poles | warehouseController.listPoles |
| warehouse.js | POST | /poles | warehouseController.createPole |
| warehouse.js | PUT | /poles/:id | warehouseController.updatePole |
| warehouse.js | DELETE | /poles/:id | warehouseController.deletePole |
| warehouse.js | GET | /imports | warehouseController.listImports |
| warehouse.js | GET | /imports/:id | warehouseController.getImport |
| warehouse.js | POST | /imports | warehouseController.createImport |
| warehouse.js | GET | /exports | warehouseController.listExports |
| warehouse.js | GET | /exports/:id | warehouseController.getExport |
| warehouse.js | POST | /exports | warehouseController.createExport |
| warehouse.js | GET | /stock | warehouseController.getStock |
| warehouse.js | PATCH | /stock/:supplierId/:poleId | warehouseController.adjustStock |
| warehouse.js | GET | /export/:resource | warehouseController.exportExcel |
