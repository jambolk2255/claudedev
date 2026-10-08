"use client";

import { ScanLine } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: new (opts?: { formats?: string[] }) => Detector;
  }
}

export const cameraScanSupported = () => typeof window !== "undefined" && "BarcodeDetector" in window && !!navigator.mediaDevices?.getUserMedia;

/** Camera barcode scanning via the native BarcodeDetector API (Chrome/Edge/Android). USB scanners just type into inputs. */
export function ScanButton({ onDetect, size = "icon" }: { onDetect: (code: string) => void; size?: "icon" | "sm" }) {
  const t = useTranslations("scanner");
  const [open, setOpen] = useState(false);
  const [supported, setSupported] = useState(false);
  useEffect(() => setSupported(cameraScanSupported()), []);
  if (!supported) return null;
  return (
    <>
      <Button type="button" variant="outline" size={size} onClick={() => setOpen(true)} aria-label={t("scan")} title={t("scan")}>
        <ScanLine /> {size !== "icon" && t("scan")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent closeLabel={t("close")}>
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
          </DialogHeader>
          {open && (
            <Camera
              onDetect={(code) => {
                setOpen(false);
                onDetect(code);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Camera({ onDetect }: { onDetect: (code: string) => void }) {
  const t = useTranslations("scanner");
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState(false);
  const handler = useRef(onDetect);
  handler.current = onDetect;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const detector = new window.BarcodeDetector!({ formats: ["ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e", "qr_code"] });
    const tick = async () => {
      if (stopped || !video.current) return;
      try {
        const codes = await detector.detect(video.current);
        if (codes[0]?.rawValue) {
          navigator.vibrate?.(60);
          return handler.current(codes[0].rawValue);
        }
      } catch {
        /* frame not ready */
      }
      timer = setTimeout(tick, 250);
    };
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((s) => {
        stream = s;
        if (!video.current || stopped) return;
        video.current.srcObject = s;
        void video.current.play().then(tick);
      })
      .catch(() => setError(true));
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, []);

  if (error) return <p className="text-destructive text-sm">{t("denied")}</p>;
  return (
    <div className="relative overflow-hidden rounded-lg bg-black">
      <video ref={video} className="aspect-video w-full object-cover" muted playsInline />
      <div className="border-primary pointer-events-none absolute inset-x-10 top-1/2 h-0.5 -translate-y-1/2 animate-pulse border-t-2" />
      <p className="absolute inset-x-0 bottom-2 text-center text-xs text-white/80">{t("hint")}</p>
    </div>
  );
}
