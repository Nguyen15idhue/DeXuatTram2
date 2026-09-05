const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 10 : 30,
  message: { success: false, message: 'Quá nhiều yêu cầu, vui lòng thử lại sau' },
  standardHeaders: true,
  legacyHeaders: false
});

const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 60 : 120,
  message: { success: false, message: 'Quá nhiều yêu cầu admin, vui lòng thử lại sau' },
  standardHeaders: true,
  legacyHeaders: false
});

const excelLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 10 : 30,
  message: { success: false, message: 'Quá nhiều yêu cầu Excel, vui lòng thử lại sau' },
  standardHeaders: true,
  legacyHeaders: false
});

const guestSubmitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Bạn đã gửi quá nhiều đề xuất, vui lòng thử lại sau' },
  standardHeaders: true,
  legacyHeaders: false
});

const guestUploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Bạn đã upload quá nhiều file, vui lòng thử lại sau' },
  standardHeaders: true,
  legacyHeaders: false
});

const guestTrackLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: { success: false, message: 'Tra cứu quá nhiều, vui lòng thử lại sau' },
  standardHeaders: true,
  legacyHeaders: false
});

const publicDataLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { success: false, message: 'Quá nhiều yêu cầu, vui lòng thử lại sau' },
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = { authLimiter, adminLimiter, excelLimiter, guestSubmitLimiter, guestUploadLimiter, guestTrackLimiter, publicDataLimiter };
