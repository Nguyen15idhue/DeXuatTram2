import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import {
  Download,
  ExternalLink,
  Maximize2,
  Minimize2,
  RefreshCw,
  RotateCcw,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { downloadFile, openFileInNewTab } from "../../utils/filePreviewActions";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000/api";
const MIN_IMAGE_ZOOM = 0.25;
const MAX_IMAGE_ZOOM = 5;

const getViewUrl = (file) => {
  if (file.url) return file.url;
  if (file.id) return `${API_URL}/files/${file.id}/download`;
  return null;
};

const detectType = (file) => {
  const mime = (file.mime_type || "").toLowerCase();
  const name = (file.original_name || file.name || "").toLowerCase();
  const ext = name.split(".").pop();

  if (
    mime.startsWith("image/") ||
    ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico"].includes(ext)
  )
    return "image";
  if (
    mime.startsWith("video/") ||
    ["mp4", "webm", "mov", "avi", "mkv"].includes(ext)
  )
    return "video";
  if (
    mime.startsWith("audio/") ||
    ["mp3", "wav", "m4a", "ogg", "flac", "aac"].includes(ext)
  )
    return "audio";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (
    mime.includes("word") ||
    mime.includes("officedocument.wordprocessingml") ||
    ["doc", "docx"].includes(ext)
  )
    return "word";
  if (
    mime.includes("sheet") ||
    mime.includes("officedocument.spreadsheetml") ||
    mime.includes("excel") ||
    ["xls", "xlsx"].includes(ext)
  )
    return "excel";
  if (
    mime.startsWith("text/") ||
    [
      "txt",
      "csv",
      "json",
      "xml",
      "md",
      "log",
      "css",
      "js",
      "html",
      "htm",
    ].includes(ext)
  )
    return "text";
  return "unknown";
};

const FileViewer = ({
  file,
  onClose,
  inline = false,
  inlineHeight = null,
  inlineActions = null,
  overlay = null,
  pdfPage = 1,
  maximizable = false,
  fullScreen = false,
}) => {
  const { token } = useAuth();
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [imagePan, setImagePan] = useState({ x: 0, y: 0 });
  const [isImageDragging, setIsImageDragging] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionLoading, setActionLoading] = useState("");
  const [objectUrl, setObjectUrl] = useState(null);
  const [htmlContent, setHtmlContent] = useState("");
  const [textContent, setTextContent] = useState("");
  const [xlsxData, setXlsxData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [docxRenderVersion, setDocxRenderVersion] = useState(0);
  const [docxOverlayPage, setDocxOverlayPage] = useState(null);
  const url = getViewUrl(file);
  const fileType = detectType(file);
  const name = file.original_name || file.name || "File";
  const objectUrlRef = useRef(null);
  const docxContainerRef = useRef(null);
  const imageViewportRef = useRef(null);
  const imageDragRef = useRef(null);
  const isFullScreen = fullScreen || isMaximized;
  const canPanImage = zoom > 1 || rotation % 180 !== 0;

  useEffect(() => {
    if (!isFullScreen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isFullScreen]);

  useEffect(() => {
    if (!fullScreen || !onClose) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [fullScreen, onClose]);

  const handleFileAction = async (action, callback) => {
    setActionLoading(action);
    setActionError("");
    try {
      await callback(file, token);
    } catch (error) {
      setActionError(error?.message || "Không thể thực hiện thao tác với file");
    } finally {
      setActionLoading("");
    }
  };

  useEffect(() => {
    if (!url) return undefined;
    setLoading(true);
    setError("");
    setHtmlContent("");
    setTextContent("");
    setXlsxData(null);
    setDocxRenderVersion(0);
    setDocxOverlayPage(null);
    setZoom(1);
    setRotation(0);
    setImagePan({ x: 0, y: 0 });
    setIsImageDragging(false);
    imageDragRef.current = null;

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setObjectUrl(null);

    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    if (fileType === "word") {
      fetch(url, { headers })
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.arrayBuffer();
        })
        .then(async (buf) => {
          if (inline) {
            const { renderAsync } = await import("docx-preview");
            if (!docxContainerRef.current)
              throw new Error("Không tìm thấy vùng xem trước tài liệu");
            docxContainerRef.current.innerHTML = "";
            await renderAsync(buf, docxContainerRef.current, null, {
              className: "approval-docx",
              breakPages: true,
            });
            setDocxRenderVersion((version) => version + 1);
            return;
          }
          const result = await mammoth.convertToHtml({ arrayBuffer: buf });
          setHtmlContent(result.value);
        })
        .catch((err) => setError("Lỗi đọc file Word: " + err.message))
        .finally(() => setLoading(false));
    } else if (fileType === "excel") {
      fetch(url, { headers })
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.arrayBuffer();
        })
        .then((buf) => {
          const wb = XLSX.read(buf, { type: "array" });
          const sheets = wb.SheetNames.map((name) => ({
            name,
            data: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1 }),
          }));
          setXlsxData(sheets);
        })
        .catch((err) => setError("Lỗi đọc file Excel: " + err.message))
        .finally(() => setLoading(false));
    } else if (fileType === "text") {
      fetch(url, { headers })
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.text();
        })
        .then((t) => setTextContent(t))
        .catch(() => setError("Không thể đọc nội dung file"))
        .finally(() => setLoading(false));
    } else {
      fetch(url, { headers })
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.blob();
        })
        .then((blob) => {
          const objUrl = URL.createObjectURL(blob);
          objectUrlRef.current = objUrl;
          setObjectUrl(objUrl);
        })
        .catch((err) => setError("Không thể tải file: " + err.message))
        .finally(() => setLoading(false));
    }

    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [url, fileType, token, inline]);

  useEffect(() => {
    if (zoom <= 1 && rotation % 180 === 0) setImagePan({ x: 0, y: 0 });
  }, [zoom, rotation]);

  const changeZoom = useCallback((factor) => {
    setZoom((current) => Math.min(
      MAX_IMAGE_ZOOM,
      Math.max(MIN_IMAGE_ZOOM, current * factor),
    ));
  }, []);

  const handleImageWheel = useCallback((event) => {
    if (fileType !== "image" || event.deltaY === 0) return;
    event.preventDefault();
    changeZoom(event.deltaY < 0 ? 1.15 : 1 / 1.15);
  }, [changeZoom, fileType]);

  useEffect(() => {
    const viewport = imageViewportRef.current;
    if (fileType !== "image" || !viewport) return undefined;
    const onWheel = (event) => handleImageWheel(event);
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [fileType, handleImageWheel, inline]);

  const handleImagePointerDown = (event) => {
    if (!canPanImage || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    imageDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panX: imagePan.x,
      panY: imagePan.y,
    };
    setIsImageDragging(true);
  };

  const handleImagePointerMove = (event) => {
    const drag = imageDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setImagePan({
      x: drag.panX + event.clientX - drag.startX,
      y: drag.panY + event.clientY - drag.startY,
    });
  };

  const handleImagePointerUp = (event) => {
    if (imageDragRef.current?.pointerId !== event.pointerId) return;
    imageDragRef.current = null;
    setIsImageDragging(false);
  };

  const resetImageView = () => {
    setZoom(1);
    setRotation(0);
    setImagePan({ x: 0, y: 0 });
  };

  const renderImageControls = () => (
    <div
      className="flex items-center gap-1"
      title="Cuộn con lăn để phóng to/thu nhỏ; kéo ảnh để di chuyển"
    >
      <button
        type="button"
        className="btn btn-sm btn-secondary"
        onClick={() => changeZoom(1 / 1.25)}
        title="Thu nhỏ ảnh"
        aria-label="Thu nhỏ ảnh"
      >
        <ZoomOut size={15} />
      </button>
      <span className="text-xs text-gray-500 min-w-[42px] text-center" aria-live="polite">
        {Math.round(zoom * 100)}%
      </span>
      <button
        type="button"
        className="btn btn-sm btn-secondary"
        onClick={() => changeZoom(1.25)}
        title="Phóng to ảnh"
        aria-label="Phóng to ảnh"
      >
        <ZoomIn size={15} />
      </button>
      <button
        type="button"
        className="btn btn-sm btn-secondary"
        onClick={() => setRotation((current) => (current + 270) % 360)}
        title="Xoay trái 90 độ"
        aria-label="Xoay trái 90 độ"
      >
        <RotateCcw size={15} />
      </button>
      <button
        type="button"
        className="btn btn-sm btn-secondary"
        onClick={() => setRotation((current) => (current + 90) % 360)}
        title="Xoay phải 90 độ"
        aria-label="Xoay phải 90 độ"
      >
        <RotateCw size={15} />
      </button>
      <button
        type="button"
        className="btn btn-sm btn-secondary"
        onClick={resetImageView}
        title="Đặt lại chế độ xem"
        aria-label="Đặt lại chế độ xem"
      >
        <RefreshCw size={15} />
      </button>
    </div>
  );

  useEffect(() => {
    if (!inline || fileType !== "word" || !docxRenderVersion) return;
    const pages =
      docxContainerRef.current?.querySelectorAll("section.approval-docx") || [];
    const page = pages[Math.max(0, Number(pdfPage) - 1)] || null;
    if (page) page.style.position = "relative";
    setDocxOverlayPage(page);
  }, [docxRenderVersion, fileType, inline, pdfPage]);

  if (!url) {
    if (inline) {
      return <div className="alert alert-error">Không thể hiển thị file</div>;
    }
    const missingFileModal = (
      <div className="modal-overlay" onClick={onClose} style={fullScreen ? { position: "fixed", inset: 0, zIndex: 10000 } : undefined}>
        <div
          className="legacy-modal"
          style={fullScreen ? { position: "fixed", inset: 0, width: "100vw", maxWidth: "none", height: "100dvh", maxHeight: "none", borderRadius: 0 } : undefined}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-center p-6 text-gray-400">
            Không thể hiển thị file
          </div>
          <div className="form-actions">
            <button className="btn btn-secondary" onClick={onClose}>
              Đóng
            </button>
          </div>
        </div>
      </div>
    );
    return fullScreen ? createPortal(missingFileModal, document.body) : missingFileModal;
  }

  const renderContent = () => {
    if (inline && fileType === "word") {
      return (
        <>
          <div
            ref={docxContainerRef}
            className="approval-docx-container min-w-full"
          />
          {loading && (
            <div className="p-4 text-center text-base-content">
              Đang render tài liệu…
            </div>
          )}
          {error && <div className="alert alert-error m-3">{error}</div>}
        </>
      );
    }

    if (loading) {
      return <div className="p-10 text-center text-white">Đang tải...</div>;
    }
    if (error) {
      return (
        <div className="p-10 text-center text-red-400">
          <p>{error}</p>
        </div>
      );
    }

    switch (fileType) {
      case "image":
        return objectUrl ? (
          <img
            src={objectUrl}
            alt={name}
            draggable={false}
            style={{
              maxWidth: "100%",
              maxHeight: isFullScreen ? "calc(100vh - 100px)" : "70vh",
              transform: `translate(${imagePan.x}px, ${imagePan.y}px) scale(${zoom}) rotate(${rotation}deg)`,
              transformOrigin: "center",
              transition: isImageDragging ? "none" : "transform 0.15s ease-out",
              userSelect: "none",
            }}
          />
        ) : null;

      case "video":
        return objectUrl ? (
          <video
            src={objectUrl}
            controls
            className={`max-w-full ${isFullScreen ? "max-h-full" : "max-h-[70vh]"}`}
          >
            Trình duyệt không hỗ trợ video.
          </video>
        ) : null;

      case "audio":
        return objectUrl ? (
          <div className="p-10 text-center">
            <div className="text-5xl mb-4">🎵</div>
            <audio src={objectUrl} controls className="w-full max-w-[400px]" />
          </div>
        ) : null;

      case "pdf":
        return objectUrl ? (
          <iframe
            src={
              inline
                ? `${objectUrl}#page=${pdfPage}&toolbar=0&navpanes=0&view=FitH`
                : objectUrl
            }
            className={
              inline
                ? "h-full min-h-[420px] w-full border-none"
                : `w-full ${isFullScreen ? "h-full" : "h-[70vh]"} border-none`
            }
            title={name}
          />
        ) : null;

      case "word":
        return (
          <div className={`w-full p-5 bg-white text-black overflow-auto ${isFullScreen ? "h-full" : "max-h-[70vh]"}`}>
            <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
          </div>
        );

      case "excel":
        if (!xlsxData || xlsxData.length === 0) {
          return (
            <div className="p-10 text-center text-gray-400">
              Không có dữ liệu
            </div>
          );
        }
        return (
          <div className={`w-full overflow-auto p-2.5 ${isFullScreen ? "h-full" : "max-h-[70vh]"}`}>
            {xlsxData.map((sheet, si) => (
              <div key={si} className="mb-5">
                <div className="font-semibold text-white mb-2 px-2 py-1 bg-indigo-500 rounded inline-block">
                  {sheet.name}
                </div>
                <table className="w-full border-collapse bg-white text-[13px]">
                  <tbody>
                    {sheet.data.map((row, ri) => (
                      <tr key={ri}>
                        {row.map((cell, ci) => (
                          <td
                            key={ci}
                            className={`border border-gray-200 px-2 py-1 ${ri === 0 ? "bg-gray-100" : "bg-white"}`}
                          >
                            {cell != null ? String(cell) : ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        );

      case "text":
        return (
          <div className="w-full p-5">
            <pre
              style={{
                margin: 0,
                color: "#d4d4d4",
                fontSize: 13,
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontFamily: "'Consolas', 'Monaco', monospace",
              }}
            >
              {textContent}
            </pre>
          </div>
        );

      default:
        if (objectUrl) {
          return (
            <div className="p-10 text-center">
              <div className="text-5xl mb-4">📁</div>
              <p className="text-gray-300">
                Định dạng này không hỗ trợ xem trước
              </p>
              <p className="text-gray-400 text-[13px]">
                File đã được tải. Bạn có thể kéo thả ra桌mình hoặc dùng nút tải
                xuống.
              </p>
            </div>
          );
        }
        return (
          <div className="p-10 text-center text-gray-400">
            <div className="text-5xl mb-4">📁</div>
            <p>Không thể xem trước định dạng này</p>
          </div>
        );
    }
  };

  const bgColor =
    fileType === "image" || fileType === "pdf" ? "#525659" : "#1e1e1e";

  if (inline) {
    const isPdf = fileType === "pdf";
    const isWord = fileType === "word";
    return (
      <div className="w-full overflow-hidden rounded-lg border bg-base-100">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <div className="min-w-0 truncate text-sm font-semibold">{name}</div>
          {fileType === "image" && renderImageControls()}
          {inlineActions}
        </div>
        <div
          ref={fileType === "image" ? imageViewportRef : undefined}
          className={`relative max-h-[75vh] min-h-[480px] overflow-auto ${isPdf ? "mx-auto" : ""} ${isWord ? "approval-docx-scroll" : ""}`}
          onPointerDown={fileType === "image" ? handleImagePointerDown : undefined}
          onPointerMove={fileType === "image" ? handleImagePointerMove : undefined}
          onPointerUp={fileType === "image" ? handleImagePointerUp : undefined}
          onPointerCancel={fileType === "image" ? handleImagePointerUp : undefined}
          style={{
            background: bgColor,
            height: inlineHeight || undefined,
            maxHeight: inlineHeight ? "none" : undefined,
            minHeight: inlineHeight || (isPdf ? 420 : 360),
            display: "flex",
            alignItems:
              fileType === "pdf" || fileType === "word" || fileType === "excel"
                ? "flex-start"
                : "center",
            justifyContent: "center",
            flexDirection:
              fileType === "pdf" || fileType === "word" || fileType === "excel"
                ? "column"
                : "row",
            touchAction: fileType === "image" ? "none" : undefined,
            userSelect: fileType === "image" ? "none" : undefined,
            cursor: fileType === "image" && canPanImage
              ? isImageDragging ? "grabbing" : "grab"
              : undefined,
          }}
        >
          {renderContent()}
          {overlay &&
            (isWord ? (
              docxOverlayPage ? (
                createPortal(overlay, docxOverlayPage)
              ) : null
            ) : (
              <div className="pointer-events-none absolute inset-0">
                {overlay}
              </div>
            ))}
        </div>
      </div>
    );
  }

  const modal = (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={fullScreen || isMaximized ? { position: "fixed", inset: 0, zIndex: 10000, padding: 0 } : undefined}
    >
      <div
        className="legacy-modal max-w-[950px] max-h-[92vh]"
        style={isFullScreen ? {
          position: "fixed",
          inset: fullScreen ? 0 : 8,
          width: fullScreen ? "100vw" : "auto",
          maxWidth: "none",
          height: fullScreen ? "100dvh" : "auto",
          maxHeight: "none",
          padding: fullScreen ? 12 : 16,
          borderRadius: fullScreen ? 0 : undefined,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-3">
          <h3 className="m-0 text-base overflow-hidden text-ellipsis whitespace-nowrap flex-1">
            {name}
          </h3>
          <div className="flex gap-1.5 items-center">
            {fullScreen && (
              <>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary gap-1"
                  onClick={() => handleFileAction("download", downloadFile)}
                  disabled={!!actionLoading}
                  title="Tải xuống file"
                  aria-label="Tải xuống file"
                >
                  <Download size={15} />
                  <span className="hidden sm:inline">{actionLoading === "download" ? "Đang tải..." : "Tải xuống"}</span>
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary gap-1"
                  onClick={() => handleFileAction("newTab", openFileInNewTab)}
                  disabled={!!actionLoading}
                  title="Xem trong trang mới"
                  aria-label="Xem trong trang mới"
                >
                  <ExternalLink size={15} />
                  <span className="hidden sm:inline">{actionLoading === "newTab" ? "Đang mở..." : "Trang mới"}</span>
                </button>
              </>
            )}
            {maximizable && !fullScreen && (
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={() => setIsMaximized((value) => !value)}
                title={isMaximized ? "Thu nhỏ cửa sổ xem" : "Phóng to toàn màn hình"}
                aria-label={isMaximized ? "Thu nhỏ cửa sổ xem" : "Phóng to toàn màn hình"}
              >
                {isMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
            )}
            {fileType === "image" && renderImageControls()}
            <button className="btn btn-sm btn-secondary" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>
        {actionError && <div className="alert alert-error mb-2 py-2 text-sm" role="alert">{actionError}</div>}
        <div
          ref={fileType === "image" ? imageViewportRef : undefined}
          style={{
            overflow: "auto",
            maxHeight: isFullScreen ? "none" : "calc(92vh - 80px)",
            background: bgColor,
            borderRadius: 8,
            display: "flex",
            flex: isFullScreen ? 1 : undefined,
            minHeight: isFullScreen ? 0 : 200,
            alignItems:
              fileType === "pdf" || fileType === "word" || fileType === "excel"
                ? "flex-start"
                : "center",
            justifyContent: "center",
            flexDirection:
              fileType === "pdf" || fileType === "word" || fileType === "excel"
                ? "column"
                : "row",
            touchAction: fileType === "image" ? "none" : undefined,
            userSelect: fileType === "image" ? "none" : undefined,
            cursor: fileType === "image" && canPanImage
              ? isImageDragging ? "grabbing" : "grab"
              : undefined,
          }}
          onPointerDown={fileType === "image" ? handleImagePointerDown : undefined}
          onPointerMove={fileType === "image" ? handleImagePointerMove : undefined}
          onPointerUp={fileType === "image" ? handleImagePointerUp : undefined}
          onPointerCancel={fileType === "image" ? handleImagePointerUp : undefined}
        >
          {renderContent()}
        </div>
      </div>
    </div>
  );
  return fullScreen || isMaximized ? createPortal(modal, document.body) : modal;
};

export default FileViewer;
