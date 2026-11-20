import { useEffect, useRef, useState } from "react";

const PIXEL_ID = "2027444467926268";
const CONSENT_KEY = "ev-report-meta-consent-v1";
const isSurveyPage = () => /^\/nhu-cau-sac-xe\/?$/i.test(window.location.pathname);

let pixelLoad;
let initialized = false;

const loadPixel = () => {
  if (pixelLoad) return pixelLoad;
  if (!window.fbq) {
    const fbq = function () {
      if (fbq.callMethod) fbq.callMethod.apply(fbq, arguments);
      else fbq.queue.push(arguments);
    };
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = "2.0";
    fbq.queue = [];
    window.fbq = window._fbq = fbq;
  }
  window.fbq.disablePushState = true;
  pixelLoad = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://connect.facebook.com/en_US/fbevents.js";
    script.onload = resolve;
    script.onerror = () => {
      script.remove();
      reject(new Error("Không tải được Meta Pixel"));
    };
    document.head.appendChild(script);
  }).catch((error) => {
    pixelLoad = null;
    throw error;
  });
  return pixelLoad;
};

const normalizeConsent = (value) => value === "granted" || value === "denied" ? value : null;

const readConsent = () => {
  try {
    return normalizeConsent(window.localStorage.getItem(CONSENT_KEY));
  } catch (error) {
    console.warn("[EvReportMetaPixel] Không đọc được lựa chọn quảng cáo", error);
    return null;
  }
};

export default function useEvReportMetaPixel() {
  const [consent, setConsent] = useState(readConsent);
  const consentRef = useRef(consent);
  const pageViewSent = useRef(false);
  const tracking = useRef(null);

  const chooseConsent = (choice) => {
    consentRef.current = choice;
    setConsent(choice);
    try {
      window.localStorage.setItem(CONSENT_KEY, choice);
    } catch (error) {
      console.warn("[EvReportMetaPixel] Không lưu được lựa chọn quảng cáo", error);
    }
  };

  useEffect(() => {
    const onStorage = (event) => {
      if (event.storageArea !== window.localStorage || (event.key !== CONSENT_KEY && event.key !== null)) return;
      const choice = normalizeConsent(event.newValue);
      consentRef.current = choice;
      setConsent(choice);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (consent !== "granted" || !isSurveyPage()) return;
    let active = true;
    let granted = false;
    const canTrack = () => active && consentRef.current === "granted" && isSurveyPage();
    const reportError = (error) => console.warn("[EvReportMetaPixel] Lỗi đo lường", error);
    const ready = loadPixel().then(() => {
      if (!canTrack()) return;
      window.fbq("consent", "grant");
      granted = true;
      if (!initialized) {
        window.fbq("set", "autoConfig", false, PIXEL_ID);
        window.fbq("init", PIXEL_ID);
        initialized = true;
      }
      if (!pageViewSent.current) {
        window.fbq("trackSingle", PIXEL_ID, "PageView");
        pageViewSent.current = true;
      }
    }).catch(reportError);

    tracking.current = () => {
      if (!canTrack()) return;
      void ready.then(() => {
        if (canTrack() && pageViewSent.current) window.fbq("trackSingle", PIXEL_ID, "Lead");
      }).catch(reportError);
    };

    return () => {
      active = false;
      tracking.current = null;
      if (granted) {
        try {
          window.fbq("consent", "revoke");
        } catch (error) {
          reportError(error);
        }
      }
    };
  }, [consent]);

  return { consent, chooseConsent, trackLead: () => tracking.current?.() };
}
