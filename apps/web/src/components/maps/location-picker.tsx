"use client";

import { Crosshair, ExternalLink, MapPin } from "lucide-react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { round, type LatLng } from "./geo";

// The Maps SDK wrapper is only downloaded when a key is configured and a picker is shown.
const GoogleMapPicker = dynamic(() => import("./google-map-picker"), { ssr: false, loading: () => <Skeleton className="h-56 rounded-xl" /> });

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
/** Colombo, used when nothing is selected yet. */
const DEFAULT_CENTER: LatLng = { lat: 6.9271, lng: 79.8612 };

/**
 * Pin a location. Uses Google Maps when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set;
 * otherwise falls back to coordinates + device geolocation so the feature still works.
 */
export function LocationPicker({ value, onChange, idPrefix }: { value: LatLng | null; onChange: (v: LatLng | null) => void; idPrefix: string }) {
  const t = useTranslations("maps");
  const [locating, setLocating] = useState(false);

  function locate() {
    if (!navigator.geolocation) return toast.error(t("noGeolocation"));
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange({ lat: round(pos.coords.latitude), lng: round(pos.coords.longitude) });
        setLocating(false);
      },
      () => {
        toast.error(t("geolocationDenied"));
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  const tools = (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={locate} loading={locating}>
        {!locating && <Crosshair />} {t("useMyLocation")}
      </Button>
      {value && (
        <>
          <Button type="button" variant="ghost" size="sm" asChild>
            <a href={`https://www.google.com/maps?q=${value.lat},${value.lng}`} target="_blank" rel="noopener noreferrer">
              <ExternalLink /> {t("openInMaps")}
            </a>
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
            {t("clear")}
          </Button>
        </>
      )}
    </div>
  );

  if (MAPS_KEY) {
    return (
      <div className="grid gap-2">
        <GoogleMapPicker apiKey={MAPS_KEY} value={value} onChange={onChange} center={DEFAULT_CENTER} />
        <p className="text-muted-foreground text-xs">{t("clickToPin")}</p>
        {tools}
      </div>
    );
  }

  return (
    <div className="grid gap-3 rounded-xl border border-dashed p-3">
      <div className="text-muted-foreground flex items-start gap-2 text-xs">
        <MapPin className="mt-0.5 size-3.5 shrink-0" />
        <span>{t("noKey")}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-1">
          <Label htmlFor={`${idPrefix}-lat`} className="text-xs">
            {t("latitude")}
          </Label>
          <Input
            id={`${idPrefix}-lat`}
            inputMode="decimal"
            placeholder="6.927100"
            value={value?.lat ?? ""}
            onChange={(e) => {
              const lat = Number(e.target.value);
              if (e.target.value === "") return onChange(null);
              if (!Number.isNaN(lat)) onChange({ lat, lng: value?.lng ?? DEFAULT_CENTER.lng });
            }}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`${idPrefix}-lng`} className="text-xs">
            {t("longitude")}
          </Label>
          <Input
            id={`${idPrefix}-lng`}
            inputMode="decimal"
            placeholder="79.861200"
            value={value?.lng ?? ""}
            onChange={(e) => {
              const lng = Number(e.target.value);
              if (e.target.value === "") return onChange(null);
              if (!Number.isNaN(lng)) onChange({ lat: value?.lat ?? DEFAULT_CENTER.lat, lng });
            }}
          />
        </div>
      </div>
      {tools}
    </div>
  );
}
