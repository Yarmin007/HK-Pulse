"use client";
import React, { createContext, useContext, useState, useRef, ReactNode } from 'react';
import { AlertTriangle, Trash2, HelpCircle } from 'lucide-react';

type ConfirmOptions = {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  icon?: 'danger' | 'warning' | 'question' | 'none';
};

type ConfirmContextType = {
  confirmAction: (options: ConfirmOptions) => Promise<boolean>;
};

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined);

export const useConfirm = () => {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error("useConfirm must be used within ConfirmProvider");
  return context;
};

export const ConfirmProvider = ({ children }: { children: ReactNode }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirmAction = (opts: ConfirmOptions): Promise<boolean> => {
    setOptions({ icon: opts.isDestructive ? 'danger' : 'question', ...opts });
    setIsOpen(true);
    return new Promise((resolve) => {
      resolver.current = resolve;
    });
  };

  const handleConfirm = () => {
    setIsOpen(false);
    if (resolver.current) resolver.current(true);
  };

  const handleCancel = () => {
    setIsOpen(false);
    if (resolver.current) resolver.current(false);
  };

  return (
    <ConfirmContext.Provider value={{ confirmAction }}>
      {children}
      
      {isOpen && options && (
        <div className="modal-overlay">
          <div className="modal-content">
            {/* Dynamic Icon */}
            {options.icon !== 'none' && (
              <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 mx-auto border-4 ${
                options.icon === 'danger' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                options.icon === 'warning' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                'bg-[#6D2158]/5 text-[#6D2158] border-[#6D2158]/10'
              }`}>
                {options.icon === 'danger' ? <Trash2 size={32} /> :
                 options.icon === 'warning' ? <AlertTriangle size={32} /> :
                 <HelpCircle size={32} />}
              </div>
            )}
            
            {/* Text Content */}
            <h3 className={`text-2xl font-black text-center mb-2 tracking-tight ${options.isDestructive ? 'text-slate-800' : 'text-[#6D2158]'}`}>
              {options.title}
            </h3>
            <p className="text-sm font-medium text-slate-500 text-center mb-8 px-2 leading-relaxed">
              {options.message}
            </p>
            
            {/* Buttons mapped to globals.css */}
            <div className="flex flex-col gap-3">
              <button 
                onClick={handleConfirm} 
                className={options.isDestructive ? 'btn-danger w-full' : 'btn-primary w-full'}
              >
                {options.confirmText || 'Confirm'}
              </button>
              <button 
                onClick={handleCancel} 
                className="w-full py-4 bg-slate-50 text-slate-500 rounded-3xl font-black uppercase text-[10px] tracking-widest active:scale-95 transition-all hover:bg-slate-100"
              >
                {options.cancelText || 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
};