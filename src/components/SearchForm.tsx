"use client";

import { Search, Loader2, History, X } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Country, State, City, type ICountry, type IState, type ICity } from 'country-state-city';
import { CONTINENTS, COUNTRY_CONTINENT_MAP } from "@/lib/continents";

interface SearchFormProps {
    onSearch: (city: string, keyword: string, deepSearch?: boolean) => void;
    isLoading: boolean;
    defaultDeepSearch?: boolean;
}

interface SearchHistoryItem {
    id: string;
    location: string;
    keyword: string;
    timestamp: number;
    continentCode?: string;
    countryCode?: string;
    stateCode?: string;
    cityName?: string;
}

export function SearchForm({ onSearch, isLoading, defaultDeepSearch }: SearchFormProps) {
    const [selectedContinent, setSelectedContinent] = useState("");
    const [selectedCountryCode, setSelectedCountryCode] = useState("");
    const [selectedStateCode, setSelectedStateCode] = useState("");
    const [selectedCityName, setSelectedCityName] = useState("");
    const [keyword, setKeyword] = useState("");
    const [isDeepSearch, setIsDeepSearch] = useState(defaultDeepSearch ?? false);
    const [deepSearchManuallySet, setDeepSearchManuallySet] = useState(false);

    const [history, setHistory] = useState<SearchHistoryItem[]>([]);

    useEffect(() => {
        const saved = localStorage.getItem("search_history");
        if (saved) {
            try {
                setHistory(JSON.parse(saved));
            } catch (e) {
                console.error("Failed to parse history", e);
            }
        }
    }, []);

    useEffect(() => {
        if (!deepSearchManuallySet && typeof defaultDeepSearch === "boolean") {
            setIsDeepSearch(defaultDeepSearch);
        }
    }, [defaultDeepSearch, deepSearchManuallySet]);

    const countries = useMemo<ICountry[]>(() => {
        let all = Country.getAllCountries();
        if (selectedContinent) {
            all = all.filter(c => COUNTRY_CONTINENT_MAP[c.isoCode] === selectedContinent);
        }
        return all;
    }, [selectedContinent]);

    const states = useMemo<IState[]>(() => {
        if (!selectedCountryCode) return [];
        return State.getStatesOfCountry(selectedCountryCode);
    }, [selectedCountryCode]);

    const cities = useMemo<ICity[]>(() => {
        if (!selectedCountryCode || !selectedStateCode) return [];
        return City.getCitiesOfState(selectedCountryCode, selectedStateCode);
    }, [selectedCountryCode, selectedStateCode]);

    const saveToHistory = (loc: string, key: string) => {
        const newItem: SearchHistoryItem = {
            id: Date.now().toString(),
            location: loc,
            keyword: key,
            timestamp: Date.now(),
            continentCode: selectedContinent,
            countryCode: selectedCountryCode,
            stateCode: selectedStateCode,
            cityName: selectedCityName
        };

        const newHistory = [newItem, ...history.filter(h => h.location !== loc || h.keyword !== key)].slice(0, 5); // Keep last 5 unique
        setHistory(newHistory);
        localStorage.setItem("search_history", JSON.stringify(newHistory));
    };

    const deleteHistoryItem = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        const newHistory = history.filter(h => h.id !== id);
        setHistory(newHistory);
        localStorage.setItem("search_history", JSON.stringify(newHistory));
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (keyword.trim() && selectedCountryCode) {
            // Construct location string based on what is selected
            const country = countries.find(c => c.isoCode === selectedCountryCode);
            // If we filtered countries, we need to find it in the full list if not found
            const actualCountry = country || Country.getAllCountries().find(c => c.isoCode === selectedCountryCode);

            const state = states.find(s => s.isoCode === selectedStateCode);

            let location = "";
            let displayLocation = "";

            if (selectedCityName) {
                location = `${selectedCityName}, ${state?.name}, ${actualCountry?.name}`;
                displayLocation = `${selectedCityName}, ${actualCountry?.isoCode}`;
            } else if (selectedStateCode) {
                location = `${state?.name}, ${actualCountry?.name}`;
                displayLocation = `${state?.name}, ${actualCountry?.isoCode}`;
            } else {
                location = `${actualCountry?.name}`;
                displayLocation = `${actualCountry?.name}`;
            }

            onSearch(location, keyword, isDeepSearch);
            saveToHistory(displayLocation, keyword);
        }
    };

    const handleHistoryClick = (item: SearchHistoryItem) => {
        // Restore state if possible (optional, but good UX)
        if (item.continentCode) setSelectedContinent(item.continentCode);
        if (item.countryCode) setSelectedCountryCode(item.countryCode);
        setTimeout(() => {
            if (item.stateCode) setSelectedStateCode(item.stateCode);
            setTimeout(() => {
                if (item.cityName) setSelectedCityName(item.cityName);
            }, 50);
        }, 50);

        setKeyword(item.keyword);

        // Re-construct full location string for search
        const country = Country.getAllCountries().find(c => c.isoCode === item.countryCode);
        const state = item.stateCode ? State.getStatesOfCountry(item.countryCode!)?.find(s => s.isoCode === item.stateCode) : null;

        let location = "";
        if (item.cityName) location = `${item.cityName}, ${state?.name}, ${country?.name}`;
        else if (item.stateCode) location = `${state?.name}, ${country?.name}`;
        else location = `${country?.name}`;

        onSearch(location, item.keyword, isDeepSearch);
    };

    return (
        <div className="w-full max-w-5xl mx-auto space-y-4">
            <form onSubmit={handleSubmit} className="relative z-10">
                <div className="glass-card p-3 rounded-2xl flex flex-col md:flex-row items-center gap-3 flex-wrap">

                    {/* Continent Dropdown */}
                    <div className="relative w-full md:w-auto min-w-[120px]">
                        <label className="text-xs text-muted-foreground ml-3 mb-1 block">Kıta</label>
                        <select
                            value={selectedContinent}
                            onChange={(e) => {
                                setSelectedContinent(e.target.value);
                                setSelectedCountryCode("");
                                setSelectedStateCode("");
                                setSelectedCityName("");
                            }}
                            className="w-full bg-white/5 border border-white/10 text-foreground focus:ring-1 focus:ring-primary h-12 rounded-xl outline-none px-3 appearance-none"
                        >
                            <option value="" className="bg-neutral-900">Tümü</option>
                            {CONTINENTS.map(c => (
                                <option key={c.code} value={c.code} className="bg-neutral-900">
                                    {c.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Country Dropdown */}
                    <div className="relative flex-1 w-full min-w-[150px]">
                        <label className="text-xs text-muted-foreground ml-3 mb-1 block">Ülke</label>
                        <select
                            value={selectedCountryCode}
                            onChange={(e) => {
                                setSelectedCountryCode(e.target.value);
                                setSelectedStateCode("");
                                setSelectedCityName("");
                            }}
                            className="w-full bg-white/5 border border-white/10 text-foreground focus:ring-1 focus:ring-primary h-12 rounded-xl outline-none px-3 appearance-none"
                            required
                        >
                            <option value="" className="bg-neutral-900">Ülke Seç</option>
                            {countries.map(country => (
                                <option key={country.isoCode} value={country.isoCode} className="bg-neutral-900">
                                    {country.name} {country.flag}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* State Dropdown (Province/Region) */}
                    <div className="relative flex-1 w-full min-w-[150px]">
                        <label className="text-xs text-muted-foreground ml-3 mb-1 block">Bölge / Şehir</label>
                        <select
                            value={selectedStateCode}
                            onChange={(e) => {
                                setSelectedStateCode(e.target.value);
                                setSelectedCityName("");
                            }}
                            className="w-full bg-white/5 border border-white/10 text-foreground focus:ring-1 focus:ring-primary h-12 rounded-xl outline-none px-3 appearance-none"
                            disabled={!selectedCountryCode || states.length === 0}
                        >
                            <option value="" className="bg-neutral-900">Bölge Seç</option>
                            {states.map((state) => (
                                <option key={state.isoCode} value={state.isoCode} className="bg-neutral-900">
                                    {state.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* City Dropdown (District/Locality) */}
                    <div className="relative flex-1 w-full min-w-[150px]">
                        <label className="text-xs text-muted-foreground ml-3 mb-1 block">İlçe / Semt</label>
                        <select
                            value={selectedCityName}
                            onChange={(e) => setSelectedCityName(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 text-foreground focus:ring-1 focus:ring-primary h-12 rounded-xl outline-none px-3 appearance-none"
                            disabled={!selectedStateCode || cities.length === 0}
                        >
                            <option value="" className="bg-neutral-900">İlçe Seç</option>
                            {cities.map((city) => (
                                <option key={`${city.name}-${city.latitude}`} value={city.name} className="bg-neutral-900">
                                    {city.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="w-px h-12 bg-white/10 hidden md:block self-center" />

                    <label className="text-xs text-muted-foreground ml-3 mb-1 block">Anahtar Kelime</label>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                        <input
                            type="text"
                            placeholder="Örn: Spor Salonu, Pizza"
                            value={keyword}
                            onChange={(e) => setKeyword(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-primary h-12 rounded-xl outline-none pl-10 pr-3"
                            required
                        />
                    </div>

                    {/* Deep Search Toggle & Submit Button Row */}
                    <div className="w-full flex items-center justify-between mt-4 pt-4 border-t border-white/5">
                        <div
                            className="flex items-center gap-3 cursor-pointer select-none group"
                            onClick={() => {
                                setIsDeepSearch(!isDeepSearch);
                                setDeepSearchManuallySet(true);
                            }}
                        >
                            <div className={cn(
                                "w-12 h-7 rounded-full transition-all duration-300 relative border",
                                isDeepSearch ? "bg-primary border-primary" : "bg-white/5 border-white/10 group-hover:bg-white/10"
                            )}>
                                <div className={cn(
                                    "absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform shadow-sm",
                                    isDeepSearch ? "translate-x-5" : "translate-x-0"
                                )} />
                            </div>
                            <div className="flex flex-col">
                                <span className={cn("text-sm font-bold transition-colors", isDeepSearch ? "text-primary" : "text-white/70 group-hover:text-white")}>Derin Arama</span>
                                <span className="text-[10px] text-muted-foreground">Standart arama 60 sonuçla sınırlı • Derin Arama 10 kredi</span>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className={cn(
                                "bg-primary hover:bg-blue-600 text-white font-medium h-12 px-8 rounded-xl transition-all duration-200 flex items-center justify-center min-w-[140px] shadow-lg shadow-primary/20",
                                isLoading && "opacity-80 cursor-not-allowed"
                            )}
                        >
                            {isLoading ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                <>
                                    <Search className="w-4 h-4 mr-2" />
                                    <span>Ara</span>
                                </>
                            )}
                        </button>
                    </div>
                </div> {/* End of glass-card */}
            </form >

            {/* Recent Searches */}
            {
                history.length > 0 && (
                    <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 animate-in fade-in slide-in-from-top-2">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <History className="w-3 h-3" /> Son Aramalar:
                        </span>
                        {history.map(item => (
                            <div
                                key={item.id}
                                className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-full px-3 py-1 text-xs text-white transition-colors cursor-pointer group"
                                onClick={() => handleHistoryClick(item)}
                            >
                                <span>{item.location} <span className="text-muted-foreground">•</span> {item.keyword}</span>
                                <button
                                    onClick={(e) => deleteHistoryItem(e, item.id)}
                                    className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        ))}
                    </div>
                )
            }
        </div >
    );
}
