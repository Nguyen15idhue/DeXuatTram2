const QRCode = require("qrcode");

/**
 * Tạo ảnh QR dạng PNG Buffer chuẩn để nạp thẳng vào pdf.embedPng() hoặc zip.file()
 * @param {string} url - Đường link cần gắn vào QR
 * @param {number} width - Kích thước pixel (mặc định 400px cho độ nét cao khi in)
 * @param {object} [options] - Tùy chọn thêm: margin, errorCorrectionLevel
 * @returns {Promise<Buffer>}
 */
async function generateQrPngBuffer(url, width = 400, options = {}) {
  if (!url) {
    throw new Error("Thiếu URL để tạo mã QR");
  }

  return await QRCode.toBuffer(url, {
    type: "png",
    width,
    margin: Number.isFinite(Number(options.margin)) ? Number(options.margin) : 1,
    errorCorrectionLevel: options.errorCorrectionLevel || "M",
    color: {
      dark: "#000000",
      light: "#FFFFFF",
    },
  });
}

module.exports = { generateQrPngBuffer };
