"use client";

import { X, Globe, Phone, MapPin, Star, Clock, MessageSquare } from "lucide-react";
import { PlaceResult } from "./ResultsTable";
import { cn } from "@/lib/utils";
import { useEffect } from "react";

interface PlaceDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    place: PlaceResult | null;
}

export function PlaceDetailModal({ isOpen, onClose, place }: PlaceDetailModalProps) {

    // Close on escape key
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handleEsc);
        return () => window.removeEventListener("keydown", handleEsc);
    }, [onClose]);

    if (!isOpen || !place) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-[#121212] border border-white/10 rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-300">

                {/* Header Image/Gradient */}
                <div className="h-32 bg-gradient-to-r from-primary/20 to-purple-500/20 relative">
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 p-2 bg-black/20 hover:bg-black/40 text-white rounded-full transition-colors backdrop-blur-md"
                    >
                        <X className="w-5 h-5" />
                    </button>
                    <div className="absolute -bottom-10 left-6">
                        <div className="w-20 h-20 rounded-2xl bg-[#1c1c1c] border-4 border-[#121212] flex items-center justify-center shadow-xl">
                            <span className="text-3xl font-bold text-primary">{place.name.charAt(0)}</span>
                        </div>
                    </div>
                </div>

                <div className="pt-12 px-6 pb-8">
                    {/* Title & Badges */}
                    <div className="flex flex-col gap-2 mb-6">
                        <h2 className="text-2xl font-bold text-white">{place.name}</h2>
                        <div className="flex flex-wrap gap-2">
                            {place.business_status && (
                                <span className={cn(
                                    "px-2.5 py-0.5 rounded-full text-xs font-medium border",
                                    place.business_status === "OPERATIONAL"
                                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                        : "bg-red-500/10 text-red-400 border-red-500/20"
                                )}>
                                    {place.business_status === "OPERATIONAL" ? "Faal İşletme" : "Kapalı/Bilinmiyor"}
                                </span>
                            )}
                            {place.types?.slice(0, 3).map((t, i) => (
                                <span key={i} className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-300 border border-blue-500/20 capitalize">
                                    {t.replace(/_/g, " ")}
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* Info Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">İletişim</h3>

                            <div className="flex items-start gap-3 text-sm text-white/90">
                                <MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                                <span>{place.formatted_address}</span>
                            </div>

                            {place.formatted_phone_number ? (
                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-3 text-sm text-white/90">
                                        <Phone className="w-4 h-4 text-primary shrink-0" />
                                        <span>{place.formatted_phone_number}</span>
                                    </div>
                                    {place.phones && place.phones.length > 0 && (
                                        <div className="text-xs text-muted-foreground">
                                            Bulunan Telefonlar: {place.phones.slice(0, 3).join(", ")}
                                            {place.phones.length > 3 ? ` +${place.phones.length - 3}` : ""}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                    <Phone className="w-4 h-4 opacity-50 shrink-0" />
                                    <span>Telefon Yok</span>
                                </div>
                            )}

                            {place.website ? (
                                <a
                                    href={place.website}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-3 text-sm text-blue-400 hover:text-blue-300 transition-colors"
                                >
                                    <Globe className="w-4 h-4 shrink-0" />
                                    <span className="truncate max-w-[200px]">{place.website.replace(/^https?:\/\//, '')}</span>
                                </a>
                            ) : (
                                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                    <Globe className="w-4 h-4 opacity-50 shrink-0" />
                                    <span>Web Sitesi Yok</span>
                                </div>
                            )}
                        </div>

                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Performans</h3>

                            <div className="flex items-center gap-4">
                                <div className="flex flex-col">
                                    <span className="text-3xl font-bold text-white flex items-center gap-2">
                                        {place.rating || "-"} <Star className="w-6 h-6 text-yellow-500 fill-current" />
                                    </span>
                                    <span className="text-xs text-muted-foreground">Ortalama Puan</span>
                                </div>
                                <div className="w-px h-10 bg-white/10" />
                                <div className="flex flex-col">
                                    <span className="text-3xl font-bold text-white">
                                        {place.user_ratings_total || 0}
                                    </span>
                                    <span className="text-xs text-muted-foreground">Toplam Yorum</span>
                                </div>
                            </div>

                            {place.opening_hours?.open_now !== undefined && (
                                <div className="flex items-center gap-2 mt-4">
                                    <Clock className="w-4 h-4 text-muted-foreground" />
                                    <span className={cn(
                                        "text-sm font-medium",
                                        place.opening_hours.open_now ? "text-green-400" : "text-red-400"
                                    )}>
                                        Şu an {place.opening_hours.open_now ? "Açık" : "Kapalı"}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Action Footer */}
                    <div className="flex gap-3 pt-6 border-t border-white/10">
                        {place.location && (
                            <a
                                href={`https://www.google.com/maps/search/?api=1&query=${place.location.latitude},${place.location.longitude}&query_place_id=${place.place_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white py-3 rounded-xl flex items-center justify-center gap-2 transition-all font-medium"
                            >
                                <MapPin className="w-4 h-4" /> Google Maps'te Aç
                            </a>
                        )}
                    </div>

                </div>
            </div>
        </div>
    );
}
