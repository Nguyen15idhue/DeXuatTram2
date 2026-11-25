const QRCode = require("qrcode");

/**
 * Tạo ảnh QR dạng PNG Buffer chuẩn để nạp thẳng vào pdf.embedPng() hoặc zip.file()
 * @param {string} url - Đường link cần gắn vào QR
 * @param {number} width - Kích thước pixel (mặc định 400px cho độ nét cao khi in)
 * @returns {Promise<Buffer>}
 */
async function generateQrPngBuffer(url, width = 400) {
  if (!url) {
    throw new Error("Thiếu URL để tạo mã QR");
  }

  return await QRCode.toBuffer(url, {
    type: "png",
    width,
    margin: 1,
    errorCorrectionLevel: "M",
    color: {
      dark: "#000000",
      light: "#FFFFFF",
    },
  });
}

module.exports = { generateQrPngBuffer };
