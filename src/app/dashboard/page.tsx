"use client";

import Image from "next/image";
import Link from "next/link";
import { SearchForm } from "@/components/SearchForm";
import { ResultsTable, PlaceResult } from "@/components/ResultsTable";
import { searchPlaces, searchPlacesAsync } from "@/app/actions/search-places";
import { useState, useEffect, useCallback } from "react";
import { History as HistoryIcon, Clock, Search, LayoutDashboard, Coins, LogOut, Loader2, RefreshCw, CheckCircle, User as UserIcon, CreditCard, TrendingUp } from "lucide-react";
import { useSession, signOut } from "next-auth/react";
import { getLeads } from "@/app/actions/get-leads";
import { AnalyticsView } from "@/components/AnalyticsView";
import { UsageView } from "@/components/UsageView";
import { cn } from "@/lib/utils";
import { getUserProfile } from "@/app/actions/get-user-profile";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { getSearchHistory } from "@/app/actions/get-search-history";
import { PLANS, SubscriptionTier } from "@/lib/plans";
import ProfileTabs from "@/components/dashboard/profile/ProfileTabs";
import { SearchProgress } from "@/components/SearchProgress";
import { getEnrichedPlaces } from "@/app/actions/get-enriched-places";

type ViewState = "search" | "analytics" | "usage" | "history" | "profile";

export default function Home() {
  const { data: session } = useSession();
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [pollingJobId, setPollingJobId] = useState<string | null>(null);
  const [streamId, setStreamId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [pollingPageToken, setPollingPageToken] = useState<string | null>(null);
  const [pollingFallbackAttempted, setPollingFallbackAttempted] = useState(false);
  const [history, setHistory] = useState<any[]>([]);


  // View State
  const [currentView, setCurrentView] = useState<ViewState | "history">("search");

  // Pagination State
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [currentCity, setCurrentCity] = useState("");
  const [currentKeyword, setCurrentKeyword] = useState("");
  const [currentDeepSearch, setCurrentDeepSearch] = useState(false);

  const loadProfile = async () => {
    const targetUserId = session?.user?.id || "default-user";
    try {
      const [profile, searchHistory] = await Promise.all([
        getUserProfile(targetUserId),
        getSearchHistory(10)
      ]);
      setUserProfile(profile);
      setHistory(searchHistory);
    } catch (err) {
      console.error("Failed to fetch profile/history", err);
    }
  };

  useEffect(() => {
    loadProfile();
  }, [session]);



  // Polling Effect (maintains status check/completion)
  useEffect(() => {
    if (!pollingJobId) return;

    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${pollingJobId}`, { cache: "no-store" });
        const data = await res.json().catch(() => ({}));

        if (!res.ok || data?.status === "missing") {
          if (!pollingFallbackAttempted) {
            setPollingFallbackAttempted(true);
            try {
              const targetUserId = session?.user?.id || "default-user";
              const fallbackResults = await searchPlaces(
                currentCity,
                currentKeyword,
                undefined,
                pollingPageToken || undefined,
                targetUserId,
                currentDeepSearch
              );

              if (cancelled) return;

              if (pollingPageToken) {
                setResults(prev => [...prev, ...fallbackResults.places]);
              } else {
                setResults(fallbackResults.places);
              }
              if (fallbackResults.jobId) setStreamId(fallbackResults.jobId);

              if (fallbackResults.nextPageToken === "plan_limit_reached") {
                setError("Planınızın arama başına sonuç limitine ulaştınız. Daha fazla sonuç için planınızı yükseltin.");
              }

              setNextPageToken(fallbackResults.nextPageToken || null);
              setPollingJobId(null);
              setPollingPageToken(null);
              setIsLoading(false);
              loadProfile();
            } catch (fallbackError: any) {
              if (cancelled) return;
              setError(fallbackError?.message || "Arama job'u bulunamadı ve senkron arama da başarısız oldu.");
              setPollingJobId(null);
              setPollingPageToken(null);
              setIsLoading(false);
            }
          }
          return;
        }

        setJobStatus(data.status);

        if (data.status === "completed") {
          // Final consistency check / overwrite with full results
          const resultPlaces = data?.result?.places ?? [];
          const nextToken = data?.result?.nextPageToken || null;
          if (data?.result?.jobId) setStreamId(data.result.jobId);

          if (pollingPageToken) {
            // For Load More, we might have streamed some already. 
            // Best to just replace with the 'definitive' set from the job result 
            // to ensure we don't have dupes or missed items.
            // But wait, 'prev' includes OLD pages. resultPlaces is JUST the new page.
            // We need to merge correctly.
            setResults(prev => {
              // Prevent duplicates if stream also added them.
              // Actually, simpler to just Filter out the 'new' ones from prev (if we stream-added them) and append definitive?
              // Or, if we trust the stream, we don't need to do anything if it's already there?
              // But polling 'result' is the source of truth for 'nextToken'.

              // Deduplicate helper
              const existingIds = new Set(prev.map(p => p.place_id));
              const validNew = resultPlaces.filter((p: any) => !existingIds.has(p.place_id));
              return [...prev, ...validNew];
            });
          } else {
            // Initial Search.
            // We should replace whatever we streamed with the final definitive list?
            // Or just dedupe?
            // If we replace, we might see a flicker if stream was ahead/behind.
            // Dedupe is safer.
            setResults(prev => {
              const existingIds = new Set(prev.map(p => p.place_id));
              const validNew = resultPlaces.filter((p: any) => !existingIds.has(p.place_id));
              return [...prev, ...validNew];
            });
          }

          if (nextToken === "plan_limit_reached") {
            setError("Planınızın arama başına sonuç limitine ulaştınız. Daha fazla sonuç için planınızı yükseltin.");
          }
          setNextPageToken(nextToken);
          setPollingJobId(null);
          setPollingPageToken(null);
          setIsLoading(false);
          loadProfile();
        } else if (data.status === "failed") {
          setError(data.error || "Arama işlemi başarısız oldu.");
          setPollingJobId(null);
          setPollingPageToken(null);
          setIsLoading(false);
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 1500);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [pollingJobId, pollingFallbackAttempted, pollingPageToken, currentCity, currentKeyword, currentDeepSearch, session]);

  // Real-time Stream Effect with Batching
  useEffect(() => {
    const targetId = streamId || pollingJobId;
    if (!targetId) return;

    console.log("Starting Search Stream for ID:", targetId);
    const eventSource = new EventSource(`/api/stream-search?jobId=${targetId}`);

    // Buffer to hold incoming updates
    let updateBuffer: any[] = [];
    let bufferTimeout: NodeJS.Timeout | null = null;

    const flushBuffer = () => {
      if (updateBuffer.length === 0) return;

      setResults((prev) => {
        const prevMap = new Map(prev.map(p => [p.place_id, p]));

        updateBuffer.forEach((newPlace: any) => {
          if (prevMap.has(newPlace.place_id)) {
            const existing = prevMap.get(newPlace.place_id)!;
            prevMap.set(newPlace.place_id, {
              ...existing,
              ...newPlace,
              emails: newPlace.emails?.length ? newPlace.emails : existing.emails,
              emailScores: newPlace.emailScores && Object.keys(newPlace.emailScores).length > 0 ? newPlace.emailScores : existing.emailScores,
              phones: newPlace.phones?.length ? newPlace.phones : existing.phones,
              socials: newPlace.socials && Object.keys(newPlace.socials).length > 0 ? newPlace.socials : existing.socials,
              website: newPlace.website || existing.website
            });
          } else {
            prevMap.set(newPlace.place_id, newPlace);
          }
        });
        return Array.from(prevMap.values());
      });

      // Clear buffer
      updateBuffer = [];
      bufferTimeout = null;
    };

    eventSource.onmessage = (event) => {
      try {
        const newPlaces = JSON.parse(event.data);
        if (Array.isArray(newPlaces) && newPlaces.length > 0) {
          updateBuffer.push(...newPlaces);

          // Debounce/Throttle the update
          if (!bufferTimeout) {
            bufferTimeout = setTimeout(flushBuffer, 1000); // Update UI every 1 second max
          }
        }
      } catch (e) {
        console.error("Stream parse error:", e);
      }
    };

    eventSource.onerror = (err) => {
      console.error("Stream connection error", err);
      eventSource.close();
      if (bufferTimeout) clearTimeout(bufferTimeout);
    };

    return () => {
      eventSource.close();
      if (bufferTimeout) clearTimeout(bufferTimeout);
    };
  }, [streamId, pollingJobId]);

  // Enrichment Data Polling - Fetch updated emails/socials from database
  useEffect(() => {
    // Only poll when we have results and search is complete
    if (results.length === 0 || isLoading) return;

    // Check if any results have pending scrape status (need enrichment)
    const needsEnrichment = results.some(r =>
      (!r.emails || r.emails.length === 0) ||
      (!r.phones || r.phones.length === 0) ||
      (!r.socials || Object.keys(r.socials).length === 0)
    );
    if (!needsEnrichment) return;

    let pollCount = 0;
    const MAX_POLLS = 12; // Poll for up to 1 minute (12 x 5s)

    const pollEnrichment = async () => {
      const placeIds = results.map(r => r.place_id);
      try {
        const enrichedData = await getEnrichedPlaces(placeIds);

        if (enrichedData && enrichedData.length > 0) {
          setResults(prev => {
            const updatedMap = new Map(prev.map(p => [p.place_id, p]));

            enrichedData.forEach((enriched: any) => {
              if (updatedMap.has(enriched.place_id)) {
                const existing = updatedMap.get(enriched.place_id)!;
                // Only update if we have new data
                if ((enriched.emails?.length > 0 && (!existing.emails || existing.emails.length === 0)) ||
                  (enriched.phones?.length > 0 && (!existing.phones || existing.phones.length === 0)) ||
                  (enriched.socials && Object.keys(enriched.socials).length > 0 && (!existing.socials || Object.keys(existing.socials).length === 0))) {
                  updatedMap.set(enriched.place_id, {
                    ...existing,
                    emails: enriched.emails?.length > 0 ? enriched.emails : existing.emails,
                    emailScores: enriched.emailScores && Object.keys(enriched.emailScores).length > 0 ? enriched.emailScores : existing.emailScores,
                    phones: enriched.phones?.length > 0 ? enriched.phones : existing.phones,
                    socials: enriched.socials && Object.keys(enriched.socials).length > 0 ? enriched.socials : existing.socials,
                    website: enriched.website || existing.website
                  });
                }
              }
            });

            return Array.from(updatedMap.values());
          });
        }
      } catch (err) {
        console.error("Enrichment poll error:", err);
      }
    };

    // Initial poll after 3 seconds
    const initialTimeout = setTimeout(pollEnrichment, 3000);

    // Then poll every 5 seconds
    const interval = setInterval(() => {
      pollCount++;
      if (pollCount >= MAX_POLLS) {
        clearInterval(interval);
        return;
      }
      pollEnrichment();
    }, 5000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [results.length, isLoading]);


  // Loading Screen State
  const [showLoadingScreen, setShowLoadingScreen] = useState(false);

  const handleSearchComplete = useCallback(() => {
    setShowLoadingScreen(false);
  }, []);

  const handleSearch = async (city: string, keyword: string, deepSearch: boolean = false) => {
    setIsLoading(true);
    setShowLoadingScreen(true); // Enable loading screen
    setError(null);
    setResults([]);
    setNextPageToken(null);
    setCurrentCity(city);
    setCurrentKeyword(keyword);
    setCurrentDeepSearch(deepSearch); // Track for pagination if needed
    setPollingPageToken(null);
    setPollingFallbackAttempted(false);
    setStreamId(null);
    setCurrentView("search");

    try {
      const targetUserId = session?.user?.id || "default-user";
      const response = await searchPlacesAsync(city, keyword, targetUserId, undefined, deepSearch);

      if (response.type === "CACHED") {
        setResults(response.results.places);
        setNextPageToken(response.results.nextPageToken || null);
        if (response.results.jobId) setStreamId(response.results.jobId);
        setIsLoading(false);
        // Do NOT close loading screen immediately. Let the timer finish (60s) as requested.
        // setShowLoadingScreen(false); 
        loadProfile();
      } else {
        setPollingJobId(response.jobId || null);
        setPollingPageToken(null);
        setPollingFallbackAttempted(false);
        setJobStatus("pending");
      }
    } catch (err: any) {
      setError(err.message || "Arama sırasında bir hata oluştu.");
      setIsLoading(false);
      setShowLoadingScreen(false);
    }
  };

  const handleLoadMore = async () => {
    if (!nextPageToken || isLoading) return;

    setIsLoading(true);
    try {
      const targetUserId = session?.user?.id || "default-user";
      const requestedPageToken = nextPageToken;
      // Pass the pagination token to the server action
      // Note: We don't re-initiate deep search logic on validation (deepSearch param usually logic for INIT), 
      // but we pass it for consistency or backend might check payload validation.
      // Actually, for pagination, 'deepSearch' boolean might be ignored if token is present, 
      // OR we should pass it to match schema? Schema has default false.
      // Let's pass the state we stored.
      const response = await searchPlacesAsync(currentCity, currentKeyword, targetUserId, requestedPageToken, currentDeepSearch);

      if (response.type === "CACHED") {
        const newResults = response.results.places;
        setResults(prev => [...prev, ...newResults]); // Append results
        setNextPageToken(response.results.nextPageToken || null);
        setIsLoading(false);
      } else {
        setPollingJobId(response.jobId || null);
        setPollingPageToken(requestedPageToken);
        setPollingFallbackAttempted(false);
        setJobStatus("pending");
      }
    } catch (err: any) {
      setError(err.message || "Daha fazla sonuç yüklenirken hata oluştu.");
      setIsLoading(false);
    }
  };

  const activeTier = (userProfile?.subscriptionTier || "FREE") as SubscriptionTier;
  const email2faEnabled = Boolean(userProfile?.twoFactorEmailEnabled);
  const totpEnabled = Boolean(userProfile?.twoFactorTotpEnabled);

  return (
    <div className="min-h-screen relative overflow-hidden bg-background text-foreground selection:bg-primary/20 flex">
      {/* Sidebar / Navigation Rail (Desktop) */}
      <div className="w-64 hidden md:flex flex-col py-8 px-4 border-r border-white/5 bg-background/50 backdrop-blur-xl z-20 fixed h-full left-0 top-0">
        <div className="mb-10 px-2">
          <div className="relative w-24 h-8">
            <Image src="/logo.png" alt="Zakrom Logo" fill className="object-contain object-left" />
          </div>
        </div>

        <nav className="space-y-2 flex-1">
          <button
            onClick={() => setCurrentView("search")}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group relative overflow-hidden",
              currentView === "search" ? "bg-primary text-white shadow-lg shadow-primary/25 font-medium" : "text-slate-400 hover:text-white hover:bg-white/5"
            )}
          >
            <Search className="w-5 h-5 shrink-0" />
            <span className="flex-1 text-left text-sm">İşletme Ara</span>
            {currentView === "search" && <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent pointer-events-none" />}
          </button>



          <button
            onClick={() => setCurrentView("analytics")}
            disabled={results.length === 0}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group relative overflow-hidden",
              currentView === "analytics" ? "bg-purple-500 text-white shadow-lg shadow-purple-500/25 font-medium" : "text-slate-400 hover:text-white hover:bg-white/5",
              results.length === 0 && "opacity-50 cursor-not-allowed hover:bg-transparent hover:text-slate-400"
            )}
          >
            <LayoutDashboard className="w-5 h-5 shrink-0" />
            <span className="flex-1 text-left text-sm">Analiz</span>
          </button>

          <button
            onClick={() => setCurrentView("history")}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group relative overflow-hidden",
              currentView === "history" ? "bg-primary text-white shadow-lg shadow-primary/25 font-medium" : "text-slate-400 hover:text-white hover:bg-white/5"
            )}
          >
            <HistoryIcon className="w-5 h-5 shrink-0" />
            <span className="flex-1 text-left text-sm">Geçmiş</span>
          </button>

          <div className="pt-4 pb-2">
            <div className="h-px bg-white/5 w-full mx-auto" />
          </div>

          <button
            onClick={() => setCurrentView("usage")}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group relative overflow-hidden",
              currentView === "usage" ? "bg-primary text-white shadow-lg shadow-primary/25 font-medium" : "text-slate-400 hover:text-white hover:bg-white/5"
            )}
          >
            <CreditCard className="w-5 h-5 shrink-0" />
            <span className="flex-1 text-left text-sm">Plan & Kredi</span>
          </button>

          <button
            onClick={() => setCurrentView("profile")}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group relative overflow-hidden",
              currentView === "profile" ? "bg-primary text-white shadow-lg shadow-primary/25 font-medium" : "text-slate-400 hover:text-white hover:bg-white/5"
            )}
          >
            <UserIcon className="w-5 h-5 shrink-0" />
            <span className="flex-1 text-left text-sm">Profil</span>
          </button>
        </nav>

        <div className="border-t border-white/5 pt-6 mt-2 space-y-4">
          <div className="bg-white/5 p-3 rounded-xl border border-white/5 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-primary to-blue-600 flex items-center justify-center text-xs font-bold text-white uppercase">
              {session?.user?.name?.substring(0, 2) || "US"}
            </div>
            <div className="flex-1 overflow-hidden">
              <div className="text-xs font-bold text-white truncate">{session?.user?.name || "Kullanıcı"}</div>
              <div className="text-[10px] text-zinc-400 truncate">{session?.user?.email}</div>
            </div>
          </div>

          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="w-full flex items-center gap-2 px-4 py-2 text-xs font-medium text-red-400 hover:bg-red-500/10 hover:text-red-300 rounded-lg transition-colors"
          >
            <LogOut className="w-3 h-3" />
            <span>Çıkış Yap</span>
          </button>
        </div>
      </div>

      {/* Bottom Navigation (Mobile) */}
      <div className="md:hidden fixed bottom-0 left-0 w-full h-16 bg-[#0a0a0a]/90 backdrop-blur-xl border-t border-white/10 z-50 flex items-center justify-around px-6">
        <button
          onClick={() => setCurrentView("search")}
          className={cn(
            "flex flex-col items-center gap-1 p-2 rounded-lg transition-colors",
            currentView === "search" ? "text-primary" : "text-muted-foreground"
          )}
        >
          <Search className="w-5 h-5" />
          <span className="text-[10px] font-medium">Arama</span>
        </button>

        <button
          onClick={() => setCurrentView("analytics")}
          disabled={results.length === 0}
          className={cn(
            "flex flex-col items-center gap-1 p-2 rounded-lg transition-colors",
            currentView === "analytics" ? "text-purple-500" : "text-muted-foreground",
            results.length === 0 && "opacity-50"
          )}
        >
          <LayoutDashboard className="w-5 h-5" />
          <span className="text-[10px] font-medium">Analiz</span>
        </button>

        <button
          onClick={() => setCurrentView("profile")}
          className={cn(
            "flex flex-col items-center gap-1 p-2 rounded-lg transition-colors",
            currentView === "profile" ? "text-emerald-400" : "text-muted-foreground"
          )}
        >
          <UserIcon className="w-5 h-5" />
          <span className="text-[10px] font-medium">Profil</span>
        </button>

        <div className="flex flex-col items-center gap-1 p-2">
          <Coins className="w-5 h-5 text-yellow-500" />
          <span className="text-[10px] font-bold text-white">
            {userProfile?.credits !== undefined ? userProfile.credits : "..."}
          </span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 md:pl-64 min-h-screen relative pb-20 md:pb-0">
        {/* Background Gradients */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-primary/20 rounded-full blur-[120px] opacity-30 -z-10 pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-[800px] h-[600px] bg-purple-500/10 rounded-full blur-[120px] opacity-20 -z-10 pointer-events-none" />

        <div className="container mx-auto px-4 py-12 md:py-16">

          {currentView === "search" ? (
            <div className="animate-in fade-in slide-in-from-left-4 duration-500">
              <div className="flex flex-col items-center mb-12 space-y-4">
                <div className="relative w-64 h-24 md:w-96 md:h-32">
                  <Image
                    src="/logo.png"
                    alt="ZAKROM PRO"
                    fill
                    className="object-contain drop-shadow-2xl"
                    priority
                  />
                </div>
                <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
                  Potansiyel müşterilerini bul. İşletmeleri ara, iletişim bilgilerini listele ve Excel'e aktar.
                </p>

                {/* Quota & Usage Quick Info */}
                {userProfile && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-4xl mt-8">
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col items-center justify-center text-center">
                      <span className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-1">Aktif Plan</span>
                      <span className="text-lg font-bold text-primary">{PLANS[userProfile.subscriptionTier as SubscriptionTier]?.name}</span>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col items-center justify-center text-center">
                      <span className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-1">Arama Başı Limit</span>
                      <span className="text-lg font-bold text-white">{PLANS[userProfile.subscriptionTier as SubscriptionTier]?.resultsPerSearch} Sonuç</span>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col items-center justify-center text-center">
                      <span className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-1">Dışa Aktar</span>
                      <span className="text-lg font-bold text-white">
                        {PLANS[userProfile.subscriptionTier as SubscriptionTier]?.features.export.length > 0
                          ? PLANS[userProfile.subscriptionTier as SubscriptionTier]?.features.export.join(' & ').toUpperCase()
                          : 'Kilitli'}
                      </span>
                    </div>
                  </div>
                )}

                {/* Tier Selector Removed */}
              </div>

              <SearchForm
                onSearch={handleSearch}
                isLoading={isLoading && results.length === 0}
                defaultDeepSearch={activeTier === "BUSINESS"}
              />

              {/* Search Progress Overlay */}
              <SearchProgress
                isVisible={showLoadingScreen}
                onComplete={handleSearchComplete}
                duration={60000}
              />

              {/* Only show "Async Status Indicator" if NOT showing full screen loader (since loader covers it) */}
              {!showLoadingScreen && isLoading && pollingJobId && (
                <div className="mt-12 flex flex-col items-center justify-center space-y-6 animate-in fade-in zoom-in-95 duration-500 bg-white/5 border border-white/10 p-12 rounded-3xl backdrop-blur-sm max-w-2xl mx-auto w-full">
                  <div className="relative">
                    <Loader2 className="w-16 h-16 text-primary animate-spin" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <RefreshCw className="w-6 h-6 text-primary/40 animate-pulse" />
                    </div>
                  </div>
                  <div className="text-center space-y-2">
                    <h3 className="text-xl font-bold text-white uppercase tracking-tighter italic">
                      {jobStatus === "pending" ? "Arama Sıraya Alındı" :
                        jobStatus === "processing" ? "Veriler Analiz Ediliyor" :
                          "Arama İşleniyor"}
                    </h3>
                    <p className="text-muted-foreground text-sm max-w-xs mx-auto">
                      {jobStatus === "pending" ? "Talebiniz kuyruğa eklendi, boşta olan bir worker bekleniyor..." :
                        "Google Maps verileri asenkron olarak işleniyor. Sayfadan ayrılabilirsiniz."}
                    </p>
                  </div>

                  {/* Progress Steps */}
                  <div className="flex items-center gap-4 bg-black/20 px-6 py-3 rounded-2xl border border-white/5">
                    <div className="flex items-center gap-2">
                      <div className={cn("w-2 h-2 rounded-full", (jobStatus === "pending" || jobStatus === "processing") ? "bg-yellow-500 animate-pulse ring-4 ring-yellow-500/20" : "bg-white/10")}></div>
                      <span className={cn("text-[10px] font-black tracking-widest uppercase", (jobStatus === "pending" || jobStatus === "processing") ? "text-white" : "text-white/20")}>KUYRUK</span>
                    </div>
                    <div className="w-8 h-[1px] bg-white/10"></div>
                    <div className="flex items-center gap-2">
                      <div className={cn("w-2 h-2 rounded-full", jobStatus === "processing" ? "bg-blue-500 animate-pulse ring-4 ring-blue-500/20" : "bg-white/10")}></div>
                      <span className={cn("text-[10px] font-black tracking-widest uppercase", jobStatus === "processing" ? "text-white" : "text-white/20")}>İŞLEME</span>
                    </div>
                    <div className="w-8 h-[1px] bg-white/10"></div>
                    <div className="flex items-center gap-2">
                      <div className={cn("w-2 h-2 rounded-full", jobStatus === "completed" ? "bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]" : "bg-white/10")}></div>
                      <span className={cn("text-[10px] font-black tracking-widest uppercase", jobStatus === "completed" ? "text-white" : "text-white/20")}>BİTTİ</span>
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="mt-8 p-4 bg-red-500/10 border border-red-500/20 text-red-200 rounded-xl max-w-2xl mx-auto text-center animate-in fade-in slide-in-from-bottom-2">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                    <span className="font-bold text-xs uppercase tracking-widest">Hata Meydana Geldi</span>
                  </div>
                  {error}
                </div>
              )}

              {/* We pass a custom header action to ResultsTable if needed, or handle navigation via sidebar */}
              <div className={cn("transition-opacity duration-500", showLoadingScreen ? "opacity-0 h-0 overflow-hidden" : "opacity-100")}>
                <ResultsTable
                  results={results}
                  tier={userProfile?.subscriptionTier || "FREE"}
                  onLoadMore={handleLoadMore}
                  isLoadingMore={isLoading}
                  hasMore={!!nextPageToken}
                />
              </div>

              {!showLoadingScreen && nextPageToken === "google_limit_reached" ? (
                <div className="mt-8 p-6 bg-gradient-to-r from-blue-900/30 to-purple-900/30 border border-blue-500/30 rounded-2xl max-w-2xl mx-auto flex flex-col items-center text-center animate-in fade-in slide-in-from-bottom-4">
                  <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center mb-4">
                    <TrendingUp className="w-6 h-6 text-blue-400" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">Google Standart Arama Limiti (60 Sonuç)</h3>
                  <p className="text-muted-foreground text-sm mb-6 max-w-lg">
                    Standart aramalar Google tarafından maksimum 60 sonuç ile sınırlandırılmıştır.
                    Daha fazla sonuç (500+) bulmak için harita taraması yapan <strong>Derin Arama</strong> moduna geçmelisiniz.
                  </p>
                  <button
                    onClick={() => handleSearch(currentCity, currentKeyword, true)}
                    className="bg-primary hover:bg-blue-600 text-white font-bold h-12 px-8 rounded-xl transition-all shadow-lg shadow-primary/25 flex items-center gap-2 hover:scale-105 active:scale-95"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Derin Arama ile Devam Et
                  </button>
                </div>
              ) : !showLoadingScreen && nextPageToken ? (
                <div className="flex justify-center mt-8 pb-12">
                  <button
                    onClick={handleLoadMore}
                    disabled={isLoading}
                    className="bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium h-12 px-8 rounded-xl transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    {isLoading ? <Loader2 className="animate-spin w-4 h-4" /> : "Daha Fazla Yükle"}
                  </button>
                </div>
              ) : null}
            </div>
          ) : currentView === "history" ? (
            <div className="animate-in fade-in slide-in-from-right-4 duration-500">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-3xl font-bold text-white">Arama Geçmişi</h2>
                  <p className="text-muted-foreground">Son yaptığınız aramalar ve elde ettiğiniz sonuçlar.</p>
                </div>
                <button
                  onClick={() => setCurrentView("search")}
                  className="bg-white/5 hover:bg-white/10 text-white px-6 py-2 rounded-xl text-sm font-bold border border-white/10 transition-all"
                >
                  Yeni Arama
                </button>
              </div>

              {history.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 bg-white/5 rounded-3xl border border-dashed border-white/10">
                  <Clock className="w-12 h-12 text-white/20 mb-4" />
                  <h4 className="text-white font-medium">Henüz bir geçmişiniz yok.</h4>
                  <p className="text-muted-foreground text-sm">İlk aramanızı yaparak başlayın.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {history.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => handleSearch(item.city, item.keyword)}
                      className="group p-6 bg-white/5 rounded-3xl border border-white/10 hover:border-primary/50 transition-all cursor-pointer relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Search className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex items-start justify-between mb-4">
                        <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                          <Search className="w-5 h-5 text-primary" />
                        </div>
                        <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">
                          {new Date(item.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <h4 className="text-white font-bold text-lg mb-1 capitalize line-clamp-1">{item.keyword}</h4>
                      <p className="text-muted-foreground text-sm capitalize mb-4">{item.city}</p>

                      <div className="flex items-center justify-between pt-4 border-t border-white/5">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-3 h-3 text-green-500" />
                          <span className="text-xs text-white/60">{item.resultCount} Sonuç</span>
                        </div>
                        <span className="text-[10px] font-bold text-primary group-hover:underline uppercase tracking-tighter">Tekrar Ara</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : currentView === "profile" ? (
            <ProfileTabs
              userProfile={userProfile}
              session={session}
              history={history}
              onUpdate={loadProfile}
              initialTab="general"
            />
          ) : currentView === "usage" ? (
            <UsageView tier={userProfile?.subscriptionTier || "FREE"} />
          ) : (
            <AnalyticsView
              results={results}
              onBack={() => setCurrentView("search")}
              tier={userProfile?.subscriptionTier || "FREE"}
            />
          )}

        </div>
      </div>
    </div>
  );
}
