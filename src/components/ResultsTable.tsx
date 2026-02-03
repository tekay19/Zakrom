"use client";

import { Phone, MapPin, Star, Globe, Copy, TrendingUp, Search, Navigation, ImageIcon, ArrowUpDown, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, FileSpreadsheet, Download, Loader2, Mail, Facebook, Instagram, Linkedin, Twitter, Youtube } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { AnalyticsSheet } from "./AnalyticsSlot";
import { PlaceDetailModal } from "./PlaceDetailModal";
import { startExport } from "@/app/actions/start-export";
import { PLANS, SubscriptionTier } from "@/lib/plans";

export interface PlaceResult {
    place_id: string;
    name: string;
    rating?: number;
    user_ratings_total?: number;
    formatted_address: string;
    formatted_phone_number?: string;
    website?: string;
    types?: string[];
    location?: {
        latitude: number;
        longitude: number;
    };
    emails?: string[];
    emailScores?: { [email: string]: number }; // Email reliability scores (0-100)
    phones?: string[];
    socials?: {
        facebook?: string;
        instagram?: string;
        linkedin?: string;
        twitter?: string;
        youtube?: string;
    };
    photos?: {
        name: string;
        widthPx: number;
        heightPx: number;
        authorAttributions: {
            displayName: string;
            uri: string;
            photoUri: string;
        }[];
    }[];
    business_status?: string;
    opening_hours?: {
        open_now?: boolean;
    };
    reviews?: {
        name: string;
        relativePublishTimeDescription: string;
        rating: number;
        text: {
            text: string;
            languageCode: string;
        };
        authorAttribution: {
            displayName: string;
            uri: string;
            photoUri: string;
        };
    }[];
}

interface ResultsTableProps {
    results: PlaceResult[];
    tier?: SubscriptionTier;
    onLoadMore?: () => void;
    isLoadingMore?: boolean;
    hasMore?: boolean;
}

type SortField = "name" | "rating" | "user_ratings_total";
type SortDirection = "asc" | "desc";

export function ResultsTable({ results, tier = "FREE", onLoadMore, isLoadingMore = false, hasMore = false }: ResultsTableProps) {
    const isProOrHigher = ["PRO", "BUSINESS"].includes(tier);
    const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
    const [filterText, setFilterText] = useState("");
    const [selectedPlace, setSelectedPlace] = useState<PlaceResult | null>(null);
    const [isExporting, setIsExporting] = useState(false);
    const [exportJobId, setExportJobId] = useState<string | null>(null);
    const [exportStatus, setExportStatus] = useState<string | null>(null);
    const [showExportMenu, setShowExportMenu] = useState(false);

    // Sorting State
    const [sortField, setSortField] = useState<SortField>("rating"); // Default sort by rating
    const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = PLANS[tier]?.resultsPerSearch || 20; // Tier-based page size

    // Export Polling
    useEffect(() => {
        if (!exportJobId) return;

        const interval = setInterval(async () => {
            try {
                const res = await fetch(`/api/exports/${exportJobId}`);
                const data = await res.json();
                setExportStatus(data.status);

                if (data.status === "completed") {
                    window.location.href = `/api/exports/${exportJobId}?download=true`;
                    setExportJobId(null);
                    setIsExporting(false);
                } else if (data.status === "failed") {
                    alert("Dışa aktarma başarısız oldu: " + data.error);
                    setExportJobId(null);
                    setIsExporting(false);
                }
            } catch (err) {
                console.error("Export polling error:", err);
            }
        }, 2000);

        return () => clearInterval(interval);
    }, [exportJobId]);

    // Reset page when filter or results change (must be before early return)
    useEffect(() => {
        setCurrentPage(1);
    }, [filterText, results.length]);

    if (results.length === 0) return null;

    // Filter Logic
    const filteredResults = results.filter(place =>
        place.name.toLowerCase().includes(filterText.toLowerCase()) ||
        (place.formatted_address || "").toLowerCase().includes(filterText.toLowerCase()) ||
        (place.types?.join(" ") || "").toLowerCase().includes(filterText.toLowerCase())
    );

    // Sort Logic
    const sortedResults = [...filteredResults].sort((a, b) => {
        let valA: any = a[sortField];
        let valB: any = b[sortField];

        // Handle string comparison (case-insensitive)
        if (typeof valA === "string") valA = valA.toLowerCase();
        if (typeof valB === "string") valB = valB.toLowerCase();

        // Handle undefined/null (push to bottom)
        if (valA === undefined || valA === null) return 1;
        if (valB === undefined || valB === null) return -1;

        if (valA < valB) return sortDirection === "asc" ? -1 : 1;
        if (valA > valB) return sortDirection === "asc" ? 1 : -1;
        return 0;
    });

    // Pagination Calculations
    const totalPages = Math.ceil(sortedResults.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedResults = sortedResults.slice(startIndex, endIndex);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(sortDirection === "asc" ? "desc" : "asc");
        } else {
            setSortField(field);
            setSortDirection("desc"); // Default to desc for new field (usually better for numbers)
        }
    };

    const handleExport = async (format: "csv" | "xlsx") => {
        const plan = PLANS[tier] || PLANS.FREE;
        if (!plan.features.export.includes(format)) {
            alert(`${format.toUpperCase()} dışa aktarma özelliği planınızda bulunmuyor. Lütfen planınızı yükseltin.`);
            return;
        }

        setIsExporting(true);
        setExportStatus("pending");
        setShowExportMenu(false);

        try {
            const dataToExport = sortedResults.length > 0 ? sortedResults : results;
            const res = await startExport(dataToExport, format);
            setExportJobId(res.jobId);
        } catch (err: any) {
            alert(err.message);
            setIsExporting(false);
        }
    };

    // Helper to translate common types
    const formatType = (type: string) => {
        const translations: Record<string, string> = {
            restaurant: "Restoran",
            cafe: "Kafe",
            store: "Mağaza",
            point_of_interest: "İlgi Noktası",
            establishment: "İşletme",
            food: "Yiyecek",
            clothing_store: "Giyim",
            health: "Sağlık",
            beauty_salon: "Güzellik",
            hair_care: "Kuaför",
            spa: "Spa",
            bar: "Bar",
            lodging: "Konaklama",
            gym: "Spor Salonu",
            real_estate_agency: "Emlak",
            lawyer: "Avukat",
            dentist: "Diş Hekimi",
            doctor: "Doktor"
        };
        return translations[type] || type.replace(/_/g, " ");
    };

    // Sort Icon Helper
    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return <ArrowUpDown className="w-3 h-3 text-muted-foreground/30" />;
        return sortDirection === "asc" ?
            <ChevronUp className="w-3 h-3 text-primary" /> :
            <ChevronDown className="w-3 h-3 text-primary" />;
    }

    return (
        <>
            <div className="w-full max-w-7xl mx-auto mt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="glass-card rounded-2xl overflow-hidden">
                    <div className="p-6 border-b border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4">

                        <div className="flex items-center gap-4 flex-1">
                            <h2 className="text-xl font-semibold text-white whitespace-nowrap">
                                Arama Sonuçları <span className="text-muted-foreground ml-2 text-sm">({sortedResults.length})</span>
                            </h2>

                            {/* Filter Input */}
                            <div className="relative max-w-xs w-full ml-4">
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                                    <Search className="w-4 h-4" />
                                </div>
                                <input
                                    type="text"
                                    placeholder="Sonuçlarda ara..."
                                    value={filterText}
                                    onChange={(e) => setFilterText(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-lg h-9 pl-9 pr-3 text-sm text-foreground focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-muted-foreground/60"
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-3 relative">
                            {isExporting ? (
                                <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 px-4 py-2 rounded-lg text-primary text-sm font-bold animate-pulse">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    {exportStatus === "pending" ? "Sıraya Alınıyor..." : "Hazırlanıyor..."}
                                </div>
                            ) : (
                                <div className="relative">
                                    <button
                                        onClick={() => setShowExportMenu(!showExportMenu)}
                                        className={cn(
                                            "text-sm border px-4 py-2 rounded-lg transition-colors font-medium flex items-center gap-2 whitespace-nowrap",
                                            tier !== "FREE"
                                                ? "bg-primary/10 hover:bg-primary/20 border-primary/20 text-primary"
                                                : "bg-white/5 border-white/10 text-white/40"
                                        )}
                                    >
                                        <Download className="w-4 h-4" />
                                        Dışa Aktar {tier === "FREE" && "🔒"}
                                        <ChevronDown className={cn("w-3 h-3 transition-transform", showExportMenu && "rotate-180")} />
                                    </button>

                                    {showExportMenu && (
                                        <div className="absolute right-0 mt-2 w-48 bg-background border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                            <button
                                                onClick={() => handleExport("csv")}
                                                className="w-full px-4 py-3 text-left text-sm hover:bg-white/5 flex items-center gap-3 transition-colors border-b border-white/5"
                                            >
                                                <Copy className="w-4 h-4 text-blue-400" />
                                                CSV Olarak İndir
                                            </button>
                                            <button
                                                onClick={() => handleExport("xlsx")}
                                                className="w-full px-4 py-3 text-left text-sm hover:bg-white/5 flex items-center gap-3 transition-colors"
                                            >
                                                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                                                Excel (XLSX) İndir
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr className="border-b border-white/5 bg-white/5">
                                    <th className="p-4 font-medium text-muted-foreground w-[300px] cursor-pointer hover:bg-white/5 transition-colors select-none group" onClick={() => handleSort("name")}>
                                        <div className="flex items-center gap-2">
                                            İşletme <SortIcon field="name" />
                                        </div>
                                    </th>
                                    <th className="p-4 font-medium text-muted-foreground hidden md:table-cell">Kategori</th>
                                    <th className="p-4 font-medium text-muted-foreground cursor-pointer hover:bg-white/5 transition-colors select-none group" onClick={() => handleSort("rating")}>
                                        <div className="flex items-center gap-2">
                                            Puan <SortIcon field="rating" />
                                        </div>
                                    </th>
                                    <th className="p-4 font-medium text-muted-foreground">İletişim</th>
                                    <th className="p-4 font-medium text-muted-foreground hidden md:table-cell">E-Posta</th>
                                    <th className="p-4 font-medium text-muted-foreground hidden lg:table-cell">Dijital Varlık</th>
                                    <th className="p-4 font-medium text-muted-foreground">Konum</th>
                                    <th className="p-4 font-medium text-muted-foreground text-center">Durum</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {paginatedResults.length > 0 ? (
                                    paginatedResults.map((place) => (
                                        <ResultRow
                                            key={place.place_id}
                                            place={place}
                                            formatType={formatType}
                                            onSelect={setSelectedPlace}
                                        />
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-muted-foreground">
                                            Aramanızla eşleşen sonuç bulunamadı.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                        <div className="p-4 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
                            <div className="text-sm text-muted-foreground">
                                <span className="font-medium text-white">{sortedResults.length}</span> sonuçtan{" "}
                                <span className="font-medium text-white">{startIndex + 1}-{Math.min(endIndex, sortedResults.length)}</span> arası gösteriliyor
                            </div>

                            <div className="flex items-center gap-2">
                                {/* First Page */}
                                <button
                                    onClick={() => setCurrentPage(1)}
                                    disabled={currentPage === 1}
                                    className={cn(
                                        "w-9 h-9 rounded-lg flex items-center justify-center transition-all text-sm font-medium border",
                                        currentPage === 1
                                            ? "bg-white/5 border-white/5 text-white/30 cursor-not-allowed"
                                            : "bg-white/5 border-white/10 text-white hover:bg-white/10"
                                    )}
                                    title="İlk Sayfa"
                                >
                                    «
                                </button>

                                {/* Previous */}
                                <button
                                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                    disabled={currentPage === 1}
                                    className={cn(
                                        "w-9 h-9 rounded-lg flex items-center justify-center transition-all border",
                                        currentPage === 1
                                            ? "bg-white/5 border-white/5 text-white/30 cursor-not-allowed"
                                            : "bg-white/5 border-white/10 text-white hover:bg-white/10"
                                    )}
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </button>

                                {/* Page Numbers */}
                                <div className="flex items-center gap-1">
                                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                        let pageNum: number;
                                        if (totalPages <= 5) {
                                            pageNum = i + 1;
                                        } else if (currentPage <= 3) {
                                            pageNum = i + 1;
                                        } else if (currentPage >= totalPages - 2) {
                                            pageNum = totalPages - 4 + i;
                                        } else {
                                            pageNum = currentPage - 2 + i;
                                        }

                                        return (
                                            <button
                                                key={pageNum}
                                                onClick={() => setCurrentPage(pageNum)}
                                                className={cn(
                                                    "w-9 h-9 rounded-lg flex items-center justify-center transition-all text-sm font-medium border",
                                                    currentPage === pageNum
                                                        ? "bg-primary border-primary text-white shadow-lg shadow-primary/25"
                                                        : "bg-white/5 border-white/10 text-white hover:bg-white/10"
                                                )}
                                            >
                                                {pageNum}
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Next */}
                                <button
                                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                    disabled={currentPage === totalPages}
                                    className={cn(
                                        "w-9 h-9 rounded-lg flex items-center justify-center transition-all border",
                                        currentPage === totalPages
                                            ? "bg-white/5 border-white/5 text-white/30 cursor-not-allowed"
                                            : "bg-white/5 border-white/10 text-white hover:bg-white/10"
                                    )}
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </button>

                                {/* Last Page */}
                                <button
                                    onClick={() => setCurrentPage(totalPages)}
                                    disabled={currentPage === totalPages}
                                    className={cn(
                                        "w-9 h-9 rounded-lg flex items-center justify-center transition-all text-sm font-medium border",
                                        currentPage === totalPages
                                            ? "bg-white/5 border-white/5 text-white/30 cursor-not-allowed"
                                            : "bg-white/5 border-white/10 text-white hover:bg-white/10"
                                    )}
                                    title="Son Sayfa"
                                >
                                    »
                                </button>
                            </div>

                            <div className="text-xs text-muted-foreground">
                                Sayfa başı: <span className="font-bold text-primary">{itemsPerPage}</span> sonuç
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <AnalyticsSheet
                isOpen={isAnalyticsOpen}
                onClose={() => setIsAnalyticsOpen(false)}
                results={filteredResults}
            />

            <PlaceDetailModal
                isOpen={!!selectedPlace}
                onClose={() => setSelectedPlace(null)}
                place={selectedPlace}
            />
        </>
    );
}

interface ResultRowProps {
    place: PlaceResult;
    formatType: (type: string) => string;
    onSelect: (place: PlaceResult) => void;
}

import React from "react";

const ResultRow = React.memo(function ResultRow({ place, formatType, onSelect }: ResultRowProps) {
    return (
        <tr
            className="hover:bg-white/5 transition-colors group cursor-pointer"
            onClick={() => onSelect(place)}
        >
            <td className="p-4">
                <div className="flex items-start gap-4">
                    {/* Image Placeholder/Icon */}
                    <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center shrink-0 border border-white/10 overflow-hidden">
                        {place.photos && place.photos.length > 0 ? (
                            <ImageIcon className="w-5 h-5 text-purple-400" />
                        ) : (
                            <div className="text-xs text-muted-foreground font-bold">{place.name.charAt(0)}</div>
                        )}
                    </div>
                    <div>
                        <div className="font-medium text-white text-base">{place.name}</div>
                        <div className="flex items-center gap-3 mt-1.5 sort-ignore" onClick={(e) => e.stopPropagation()}>
                            {place.website && (
                                <a
                                    href={place.website}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
                                >
                                    <Globe className="w-3 h-3" /> Web
                                </a>
                            )}
                            {place.photos && place.photos.length > 0 && (
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                    <ImageIcon className="w-3 h-3" /> {place.photos.length} Resim
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </td>
            <td className="p-4 hidden md:table-cell">
                <div className="flex flex-wrap gap-1.5 max-w-[200px]">
                    {place.types?.slice(0, 2).map((t, i) => (
                        <span key={i} className="inline-flex items-center px-2 py-0.5 rounded textxs font-medium bg-blue-500/10 text-blue-300 border border-blue-500/20 text-[10px] capitalize">
                            {formatType(t)}
                        </span>
                    ))}
                    {place.types && place.types.length > 2 && (
                        <span className="text-[10px] text-muted-foreground px-1 self-center">+{place.types.length - 2}</span>
                    )}
                </div>
            </td>
            <td className="p-4">
                {place.rating ? (
                    <div className="flex items-center gap-1.5">
                        <div className="bg-yellow-500/10 text-yellow-500 px-1.5 py-0.5 rounded flex items-center gap-1 border border-yellow-500/20">
                            <Star className="w-3.5 h-3.5 fill-current" />
                            <span className="font-semibold">{place.rating}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">({place.user_ratings_total})</span>
                    </div>
                ) : (
                    <span className="text-muted-foreground text-xs">-</span>
                )}
            </td>
            <td className="p-4 text-muted-foreground">
                <div className="flex flex-col gap-1.5">
                    {place.formatted_phone_number ? (
                        <div className="flex items-center gap-2 text-white/80">
                            <Phone className="w-4 h-4 text-white/40" />
                            <span className="font-mono text-xs">{place.formatted_phone_number}</span>
                        </div>
                    ) : (
                        <span className="opacity-50 text-xs">-</span>
                    )}
                    {place.phones && place.phones.length > 0 && (
                        <div className="text-[10px] text-muted-foreground">
                            Bulunan: {place.phones.slice(0, 2).join(", ")}
                            {place.phones.length > 2 ? ` +${place.phones.length - 2}` : ""}
                        </div>
                    )}
                </div>
            </td>
            <td className="p-4 hidden md:table-cell">
                <div className="flex flex-col gap-1.5">
                    {place.emails && place.emails.length > 0 ? (
                        <div className="flex flex-col gap-1">
                            {place.emails.slice(0, 2).map((email, i) => {
                                const score = place.emailScores?.[email];
                                const getScoreBadge = () => {
                                    if (score === undefined) return null;
                                    if (score >= 70) return (
                                        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title={`Doğrulanmış (${score})`} />
                                    );
                                    if (score >= 50) return (
                                        <span className="w-2 h-2 rounded-full bg-yellow-500 shrink-0" title={`Olası (${score})`} />
                                    );
                                    return (
                                        <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" title={`Şüpheli (${score})`} />
                                    );
                                };
                                return (
                                    <a key={i} href={`mailto:${email}`} className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1.5 truncate max-w-[160px]">
                                        {getScoreBadge()}
                                        <Mail className="w-3 h-3 shrink-0" />
                                        <span className="truncate">{email}</span>
                                    </a>
                                );
                            })}
                            {place.emails.length > 2 && (
                                <span className="text-[9px] text-muted-foreground">+{place.emails.length - 2} daha</span>
                            )}
                        </div>
                    ) : (
                        <span className="text-xs text-muted-foreground/30">-</span>
                    )}
                </div>
            </td>
            <td className="p-4 hidden lg:table-cell">
                <div className="flex flex-col gap-1.5">
                    {place.socials && Object.keys(place.socials).length > 0 ? (
                        <div className="flex items-center gap-2 pt-1">
                            {place.socials.instagram && (
                                <a href={place.socials.instagram} target="_blank" className="text-pink-500 hover:scale-110 transition-transform" title="Instagram">
                                    <Instagram className="w-4 h-4" />
                                </a>
                            )}
                            {place.socials.facebook && (
                                <a href={place.socials.facebook} target="_blank" className="text-blue-600 hover:scale-110 transition-transform" title="Facebook">
                                    <Facebook className="w-4 h-4" />
                                </a>
                            )}
                            {place.socials.linkedin && (
                                <a href={place.socials.linkedin} target="_blank" className="text-blue-700 hover:scale-110 transition-transform" title="LinkedIn">
                                    <Linkedin className="w-4 h-4" />
                                </a>
                            )}
                            {place.socials.twitter && (
                                <a href={place.socials.twitter} target="_blank" className="text-sky-500 hover:scale-110 transition-transform" title="Twitter/X">
                                    <Twitter className="w-4 h-4" />
                                </a>
                            )}
                            {place.socials.youtube && (
                                <a href={place.socials.youtube} target="_blank" className="text-red-600 hover:scale-110 transition-transform" title="YouTube">
                                    <Youtube className="w-4 h-4" />
                                </a>
                            )}
                        </div>
                    ) : (
                        <span className="text-xs text-muted-foreground/30">-</span>
                    )}
                </div>
            </td>
            <td className="p-4 text-muted-foreground max-w-[200px] sort-ignore" onClick={(e) => e.stopPropagation()}>
                <div className="flex flex-col gap-1">
                    <div className="text-xs truncate" title={place.formatted_address}>{place.formatted_address}</div>
                    {place.location && (
                        <a
                            href={`https://www.google.com/maps/search/?api=1&query=${place.location.latitude},${place.location.longitude}&query_place_id=${place.place_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] text-blue-400 hover:underline"
                        >
                            <Navigation className="w-3 h-3" /> Haritada Göster
                        </a>
                    )}
                </div>
            </td>
            <td className="p-4 text-center">
                {place.opening_hours?.open_now !== undefined ? (
                    <div className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border mx-auto",
                        place.opening_hours.open_now
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "bg-red-500/10 text-red-400 border-red-500/20"
                    )}>
                        <div className={cn("w-1.5 h-1.5 rounded-full", place.opening_hours.open_now ? "bg-emerald-400" : "bg-red-400")} />
                        {place.opening_hours.open_now ? "Açık" : "Kapalı"}
                    </div>
                ) : (
                    <span className="text-muted-foreground text-xs opacity-50">Belirsiz</span>
                )}
            </td>
        </tr>
    );
}, (prev, next) => {
    return prev.place === next.place
        && prev.formatType === next.formatType
        && prev.onSelect === next.onSelect;
});
