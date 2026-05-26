"use client";
import React, { useState, useEffect } from 'react';
import { Moon, Star, Sparkles } from 'lucide-react';

export default function OccasionBanner() {
    const [particles, setParticles] = useState<any[]>([]);

    // Change this value manually to switch between occasions:
    // 'eid' | 'childrens_day' | 'independence_day' | 'republic_day' | 'new_year'
    const ACTIVE_OCCASION = 'eid';

    const occasions: Record<string, { title: string; description: string; bg: string; border: string; text: string }> = {
        eid: {
            title: "Eid Al-Adha Mubarak! ✨",
            description: "Wishing you and your family a blessed feast of sacrifice, peace, and happiness.",
            bg: "from-[#0A3321] via-[#125436] to-[#0A3321]",
            border: "border-[#1A5C3D]",
            text: "text-emerald-200"
        },
        childrens_day: {
            title: "Happy Children's Day! 🎈✨",
            description: "Celebrating the joy, innocence, and bright future of our children.",
            bg: "from-[#11998e] to-[#38ef7d]",
            border: "border-[#11998e]",
            text: "text-emerald-100"
        },
        independence_day: {
            title: "Independence Day Mubarak! 🇲🇻",
            description: "Wishing everyone a proud and joyful Independence Day of the Maldives.",
            bg: "from-[#d32f2f] via-[#388e3c] to-[#d32f2f]",
            border: "border-[#2e7d32]",
            text: "text-slate-100"
        },
        republic_day: {
            title: "Republic Day Mubarak! 🇲🇻",
            description: "Happy Republic Day to all citizens of the Maldives.",
            bg: "from-[#004d40] via-[#00796b] to-[#004d40]",
            border: "border-[#004d40]",
            text: "text-teal-100"
        },
        new_year: {
            title: "Happy New Year! 🎆",
            description: "Wishing you a year filled with success, peace, and prosperity.",
            bg: "from-[#0F2027] via-[#203A43] to-[#2C5364]",
            border: "border-[#203A43]",
            text: "text-teal-200"
        }
    };

    const current = occasions[ACTIVE_OCCASION] || occasions.eid;

    useEffect(() => {
        // Generate Floating Sparkles & Stars
        const newItems = Array.from({ length: 60 }).map((_, i) => {
            const size = Math.random() > 0.8 ? 28 : Math.random() > 0.5 ? 20 : 14;
            const duration = Math.random() * 6 + 6; 
            const delay = Math.random() * 4; 
            return {
                id: i,
                left: `${Math.random() * 100}%`,
                animationDuration: `${duration}s`, 
                animationDelay: `${delay}s`,
                swayDuration: `${Math.random() * 3 + 2}s`, 
                size: size,
                type: Math.random() > 0.4 ? 'sparkle' : 'star' 
            }
        });
        setParticles(newItems);

        // Auto-hide falling animations after 12 seconds
        const timer = setTimeout(() => setParticles([]), 12000);
        return () => clearTimeout(timer);
    }, []);

    return (
        <>
            {/* 1. THE FALLING ANIMATION LAYER */}
            {particles.length > 0 && (
                <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden">
                    <style dangerouslySetInnerHTML={{__html: `
                        @keyframes fall-down { 
                            0% { transform: translateY(-100px) scale(0.4); opacity: 0; } 
                            15% { opacity: 1; transform: translateY(10vh) scale(1); } 
                            50% { opacity: 0.5; }
                            75% { opacity: 1; }
                            100% { transform: translateY(110vh) scale(0.5); opacity: 0; } 
                        }
                        @keyframes sway-side { 
                            0%, 100% { transform: translateX(-20px) rotate(0deg); filter: brightness(1); } 
                            50% { transform: translateX(20px) rotate(180deg); filter: brightness(1.5) drop-shadow(0 0 10px rgba(251, 191, 36, 0.7)); } 
                        }
                        .animate-fall { animation: fall-down linear forwards; }
                        .animate-sway { animation: sway-side ease-in-out infinite; }
                    `}} />
                    {particles.map(item => (
                        <div key={item.id} className="absolute top-[-100px] animate-fall drop-shadow-md" style={{ left: item.left, animationDuration: item.animationDuration, animationDelay: item.animationDelay }}>
                            <div className="animate-sway" style={{ animationDuration: item.swayDuration }}>
                                {item.type === 'sparkle' ? (
                                    <Sparkles size={item.size} className="text-amber-300 opacity-95 fill-amber-300" />
                                ) : (
                                    <Star size={item.size} className="text-yellow-200 opacity-70 fill-yellow-100" />
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* 2. THE STATIC EID BANNER WIDGET */}
            <div className={`relative overflow-hidden mx-2 md:mx-0 bg-gradient-to-r ${current.bg} rounded-3xl md:rounded-[2rem] p-6 md:p-8 shadow-xl border ${current.border} text-white flex flex-col md:flex-row items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4 mt-4 md:mt-0`}>
                <Sparkles className="absolute top-4 left-6 text-yellow-400/20 animate-pulse fill-yellow-400/10" size={24} />
                <Star className="absolute bottom-4 right-12 text-white/10 animate-pulse delay-75 fill-white/10" size={32} />
                <Sparkles className="absolute top-6 right-1/4 text-yellow-300/30 animate-pulse delay-150 fill-yellow-300/20" size={16} />
                <div className="absolute -left-10 -bottom-10 opacity-10"><Sparkles size={150} className="text-amber-400 fill-amber-400/10" /></div>
                
                <div className="relative z-10 flex items-center gap-4 text-center md:text-left w-full md:w-auto flex-col md:flex-row">
                    <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center border border-white/20 shadow-inner backdrop-blur-sm shrink-0">
                        <Sparkles className="text-yellow-300 fill-yellow-300" size={32} />
                    </div>
                    <div>
                        <h2 className="text-2xl md:text-3xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-yellow-500 mb-1 drop-shadow-sm">
                            {current.title}
                        </h2>
                        <p className={`text-xs md:text-sm font-bold ${current.text} tracking-wide`}>
                            {current.description}
                        </p>
                    </div>
                </div>
            </div>
        </>
    );
}