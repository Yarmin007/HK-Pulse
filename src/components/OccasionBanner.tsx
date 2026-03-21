"use client";
import React, { useState, useEffect } from 'react';
import { Moon, Star } from 'lucide-react';

export default function OccasionBanner() {
    const [particles, setParticles] = useState<any[]>([]);

    useEffect(() => {
        // Generate Falling Stars & Moons
        const newItems = Array.from({ length: 60 }).map((_, i) => {
            const size = Math.random() > 0.8 ? 32 : Math.random() > 0.5 ? 24 : 16;
            const duration = Math.random() * 5 + 5; 
            const delay = Math.random() * 3; 
            return {
                id: i,
                left: `${Math.random() * 100}%`,
                animationDuration: `${duration}s`, 
                animationDelay: `${delay}s`,
                swayDuration: `${Math.random() * 2 + 2}s`, 
                size: size,
                type: Math.random() > 0.5 ? 'star' : 'moon' 
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
                        @keyframes fall-down { 0% { transform: translateY(-100px) rotate(0deg); opacity: 0; } 10% { opacity: 1; } 80% { opacity: 1; } 100% { transform: translateY(110vh) rotate(360deg); opacity: 0; } }
                        @keyframes sway-side { 0%, 100% { transform: translateX(-20px); } 50% { transform: translateX(20px); } }
                        .animate-fall { animation: fall-down linear forwards; }
                        .animate-sway { animation: sway-side ease-in-out infinite; }
                    `}} />
                    {particles.map(item => (
                        <div key={item.id} className="absolute top-[-100px] animate-fall drop-shadow-lg" style={{ left: item.left, animationDuration: item.animationDuration, animationDelay: item.animationDelay }}>
                            <div className="animate-sway" style={{ animationDuration: item.swayDuration }}>
                                {item.type === 'star' ? (
                                    <Star size={item.size} className="text-yellow-300 opacity-80 fill-yellow-300" />
                                ) : (
                                    <Moon size={item.size} className="text-white opacity-40 fill-white" />
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* 2. THE STATIC EID BANNER WIDGET */}
            <div className="relative overflow-hidden mx-2 md:mx-0 bg-gradient-to-r from-[#6D2158] via-[#8A2B71] to-[#6D2158] rounded-3xl md:rounded-[2rem] p-6 md:p-8 shadow-xl border border-[#902468] text-white flex flex-col md:flex-row items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4 mt-4 md:mt-0">
                <Star className="absolute top-4 left-6 text-white/20 animate-pulse fill-white/20" size={24} />
                <Star className="absolute bottom-4 right-12 text-white/10 animate-pulse delay-75 fill-white/10" size={32} />
                <Star className="absolute top-6 right-1/4 text-white/30 animate-pulse delay-150 fill-white/30" size={16} />
                <div className="absolute -left-10 -bottom-10 opacity-10"><Moon size={150} className="fill-white" /></div>
                
                <div className="relative z-10 flex items-center gap-4 text-center md:text-left w-full md:w-auto flex-col md:flex-row">
                    <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center border border-white/20 shadow-inner backdrop-blur-sm shrink-0">
                        <Moon className="text-yellow-300 fill-yellow-300" size={32} />
                    </div>
                    <div>
                        <h2 className="text-2xl md:text-3xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 to-yellow-500 mb-1 drop-shadow-sm">
                            Eid Mubarak! ✨
                        </h2>
                        <p className="text-xs md:text-sm font-bold text-purple-200 tracking-wide">
                            Wishing you and your family a blessed and joyous Eid.
                        </p>
                    </div>
                </div>
            </div>
        </>
    );
}