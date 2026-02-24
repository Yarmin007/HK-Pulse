"use client";
import React, { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Lock, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // 1. Let the Mobile App bypass this lock (it has its own Host Number login)
    if (pathname?.includes('/mobile')) {
      setIsAuthenticated(true);
      setIsChecking(false);
      return;
    }

    // 2. Check if this browser already logged in successfully before
    const authStatus = localStorage.getItem('hk_pulse_admin_auth');
    if (authStatus === 'true') {
      setIsAuthenticated(true);
    }
    setIsChecking(false);
  }, [pathname]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // Fetch the PIN from Settings -> System Config (Fallback to 2026 if not set up yet)
    const { data } = await supabase.from('hsk_constants').select('label').eq('type', 'admin_pin').maybeSingle();
    const correctPin = data?.label || '2026'; 

    if (pin === correctPin) {
      localStorage.setItem('hk_pulse_admin_auth', 'true');
      setIsAuthenticated(true);
    } else {
      setError('Incorrect Admin PIN.');
    }
    
    setIsLoading(false);
  };

  // Show a blank loading screen while checking local storage to prevent flashing
  if (isChecking) {
    return <div className="min-h-screen bg-[#FDFBFD] flex items-center justify-center"><Loader2 className="animate-spin text-[#6D2158]" size={32}/></div>;
  }

  // If authenticated, render the dashboard normally
  if (isAuthenticated) {
    return <>{children}</>;
  }

  // If NOT authenticated, show the Login Screen
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-antiqua">
      <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
        
        {/* Header with Custom Logo */}
        <div className="p-10 bg-gradient-to-b from-[#6D2158] to-[#902468] flex flex-col items-center text-white">
          <svg 
            viewBox="0 0 779.0408 559.8364"
            className="h-16 w-auto mb-6 text-white drop-shadow-lg"
          >
            <g>
                <path fill="currentColor" d="M446.3249,154.1565c-7.1645,48.7463-10.5173,97.9279-15.0613,148.5227l-13.8244,153.9282c-.3069,3.4173-5.5762,7.5945-8.4078,7.3067-3.0506-.3101-7.3739-4.1613-8.0238-7.8856l-32.9782-188.9979-18.3056,50.2868-334.1757.4772c-4.158.0059-7.9278-2.9903-8.7051-5.6231-.8254-2.7956,2.2962-9.9766,6.6902-9.9796l325.2134-.2193,23.3418-69.9428c.9398-2.816,4.8921-6.2965,7.3071-6.1549s7.3561,4.0239,7.8589,6.6598l29.6772,155.5961,14.8807-155.5515,14.5905-136.2981c.2809-2.6239,2.1755-10.3733,4.7519-10.7483l10.7277-1.5614c.8189-7.7266-7.7576-10.913-13.0879-9.9415-4.4065.8032-11.3235,5.9248-12.0528,12.4835l-17.7598,159.7114c-.3191,2.8694-10.5707,2.4459-10.5734-.1849l-.2501-245.2915,61.8527-.4319,1.0441,113.9918L570.238.0704l65.6921.3899-100.0107,109.7625,106.5394,138.8418-71.9084.6198-74.999-97.936-28.7757,29.539,22.8739,146.5134,24.2284-84.3501c.6584-2.2921,4.5749-5.7373,6.7842-5.9222,2.2074-.1847,6.775,2.8888,7.7913,5.471l23.2836,59.1596,166.8207.0069c-3.479-6.3327-6.8911-11.937-9.0245-17.7921-3.6963-10.1445,1.5657-20.6071,9.5988-24.2859,8.7745-4.0183,18.424-.8301,25.2361,6.6117,6.7648-7.795,17.1264-10.4345,25.7726-5.1451,7.7731,4.7554,11.8203,16.1402,6.4511,26.4242-6.2167,11.9073-18.4522,25.0592-31.4581,29.559l-202.8377-.2423-19.568-45.8937-27.395,95.6932c-.7754,2.7085-5.2918,7.1034-7.8761,7.3902-3.2398.3595-8.2946-3.8743-8.907-7.9108l-32.2252-212.4179Z"/>
                <polygon fill="currentColor" points="343.4116 249.5996 291.7421 249.3681 291.5403 150.0811 185.0103 150.1367 184.7339 249.7369 123.407 249.6255 123.4782 .1828 184.624 0 185.0213 98.2849 291.5769 97.7809 291.7613 .1355 353.5124 .3382 353.7136 219.3424 343.4116 249.5996"/>
                <path fill="currentColor" d="M757.5278,473.4462l-87.5517.5215.0463,67.2512,103.6492-.0449-.0066,16.3618-121.8009-.0313-.2756-180.4659,117.7959.1358.1099,16.1483-99.4879-.0965-.1241,63.7011,85.6803.3468c1.9428,2.8477,2.1397,7.7004,1.9653,16.1721Z"/>
                <path fill="currentColor" d="M288.1135,377.7922l18.0816-.2947-.5409,115.7788c-.0982,21.021-9.8277,42.483-27.5179,54.0608-25.3532,16.5931-60.0694,16.7763-85.3435-.115-17.5004-11.6959-27.12-33.3207-27.2318-54.4116l-.6095-114.984,17.9897-.2039,1.2298,118.0705c.2984,28.648,23.3414,46.058,50.1972,46.5803,29.2568.569,53.2062-19.0568,53.3199-49.7185l.4255-114.7628Z"/>
                <path fill="currentColor" d="M80.942,495.7405c-20.5601,2.9274-40.4425,1.3546-62.482,1.1356l-.4798,60.1896-17.8739-.2755-.1063-179.4095c25.4379-.2739,51.1778-.857,76.1557.7138,33.1766,2.0864,54.4285,27.116,54.336,58.9226-.0868,29.8411-17.8761,54.2136-49.5497,58.7234ZM112.8012,435.9662c-1.5988-53.072-61.7208-41.1317-94.6485-42.2686l.1722,86.8255c20.3889.0232,38.1689.5732,56.3045-.881,23.4086-1.8771,38.8952-19.662,38.1717-43.6759Z"/>
                <path fill="currentColor" d="M489.5993,537.7297c-1.5288-4.3604,2.0379-12.9604,4.9815-16.4828,23.7972,19.5208,54.528,27.7196,83.2839,17.6539,12.2654-4.2934,19.3082-15.1022,19.64-26.5478,1.0952-37.7761-65.8095-30.546-92.437-56.7106-12.128-11.9172-14.1085-28.7605-9.8061-45.0677,11.2687-42.7111,80.8481-42.382,113.2302-20.809-1.3807,6.0145-3.042,10.9922-5.2268,15.8878-22.334-12.511-45.8544-17.4775-69.5368-10.2088-12.917,3.9645-21.0138,14.2578-21.8392,26.5353-.8559,12.7304,7.5603,24.6303,21.0232,29.0818l50.3752,16.6562c20.0579,6.632,32.4612,22.8579,32.5008,42.6709.0391,19.5797-11.2835,36.7803-31.2853,43.8924-31.4059,11.1671-67.4314,5.4102-94.9037-16.5515Z"/>
                <path fill="currentColor" d="M471.7684,540.9736c.5889,5.2165.6534,10.1802.2602,16.5435l-112.8218.0037-.1418-179.3732,18.4355-.5393.0973,163.3538,94.1706.0115Z"/>
            </g>
          </svg>
          <h2 className="text-2xl font-black tracking-tight">Admin Gateway</h2>
          <p className="text-white/70 text-xs font-bold uppercase tracking-widest mt-1">Authorized Personnel Only</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} className="p-8 bg-white space-y-5">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-2">Secure PIN</label>
            <div className="relative mt-1 flex items-center bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden focus-within:border-[#6D2158] transition-all">
              <div className="pl-4 pr-2 py-4 text-slate-400 font-black flex items-center gap-2">
                <Lock size={16} />
              </div>
              <input 
                type="password" 
                autoFocus
                className="w-full pr-4 py-4 bg-transparent text-slate-800 font-black text-2xl outline-none placeholder:text-slate-300"
                placeholder="••••"
                value={pin}
                onChange={e => setPin(e.target.value)}
              />
            </div>
          </div>
          
          {error && (
            <div className="bg-rose-50 border border-rose-100 p-3 rounded-xl flex items-center gap-2 text-rose-600 text-xs font-bold animate-in fade-in">
              <AlertCircle size={16} className="shrink-0"/> {error}
            </div>
          )}

          <button disabled={isLoading || !pin} className="w-full py-4 bg-[#6D2158] text-white rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-purple-900/20 active:scale-95 transition-all flex items-center justify-center gap-2 mt-2">
            {isLoading ? <Loader2 className="animate-spin" size={20}/> : 'Access System'} <ArrowRight size={18}/>
          </button>
        </form>
      </div>
    </div>
  );
}