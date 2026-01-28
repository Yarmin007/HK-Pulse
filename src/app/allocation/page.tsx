"use client";
import React from 'react';
import { Printer } from 'lucide-react';

export default function AllocationPage() {
  // Data matching your PDF example
  const data = {
    date: "28-1-2026",
    occupancy: "66",
    repeaterCount: "3",
    repeaters: "11 21 42",
    occupied: "62",
    showrooms: "57 85 68 43 36",
    arrivals: "7",
    departures: "2",
    honeymooners: "55 73",
    children: "5",
    dayShut: "27",
    nightShut: "5:00 PM",
    guestInHouse: "123",
    staff: [
      { name: "Jeeth", mvpn: "2968", area: "Jetty A, B, C", duty: "AM/PM" },
      { name: "Abow", mvpn: "2962", area: "87, 91, 92, 93, 94, 95, 96, 97", duty: "MORNING" },
      { name: "Shamil", mvpn: "3035", area: "57, 82, 83, 84, 85, 86, 89, 90", duty: "MORNING" },
      { name: "Eeku", mvpn: "2964", area: "36, 51, 52, 53, 54, 55, 80, 81", duty: "NIGHT" },
      { name: "Maah", mvpn: "2842", area: "Floater", duty: "MORNING" },
      { name: "Adam", mvpn: "2731", area: "Support", duty: "MORNING" },
      { name: "Ziyatte", mvpn: "2836", area: "BOH", duty: "MORNING" },
    ]
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8 font-sans">
      
      {/* --- CONTROLS (Hidden on Print) --- */}
      <div className="print:hidden max-w-[210mm] mx-auto mb-6 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-[#6D2158]">Daily Allocation</h1>
          <p className="text-sm text-slate-500">Exact PDF Replica</p>
        </div>
        <button 
          onClick={() => window.print()}
          className="bg-[#6D2158] text-white px-6 py-2 rounded shadow-lg font-bold flex items-center gap-2"
        >
          <Printer size={18} /> Print Form
        </button>
      </div>

      {/* --- EXACT PDF REPLICA (A4) --- */}
      <div className="bg-white text-black mx-auto shadow-xl print:shadow-none w-[210mm] min-h-[297mm] p-[10mm] print:p-0 print:m-0">
        
        {/* 1. HEADER */}
        <div className="text-center font-bold text-lg border-2 border-black py-1 mb-1 uppercase">
          Housekeeping Allocation Report
        </div>

        {/* 2. STATS TABLE (The Complex Grid) */}
        <table className="w-full border-collapse border border-black text-[10px]">
          <tbody>
            {/* Row 1 */}
            <tr>
              <td className="border border-black p-1 font-bold w-[12%]">Date</td>
              <td className="border border-black p-1 w-[12%]">{data.date}</td>
              <td className="border border-black p-1 font-bold w-[18%]">REPEATER VILLAS</td>
              <td className="border border-black p-1 w-[8%]">{data.repeaterCount}</td>
              <td className="border border-black p-1 font-bold w-[18%]">SINNER VILLA</td>
              <td className="border border-black p-1 font-bold">{data.repeaters}</td>
            </tr>
            {/* Row 2 */}
            <tr>
              <td className="border border-black p-1 font-bold">Daily Occupancy%</td>
              <td className="border border-black p-1">{data.occupancy}</td>
              <td className="border border-black p-1 font-bold">BIRTHDAY VILLAS</td>
              <td className="border border-black p-1"></td>
              <td className="border border-black p-1 font-bold">SAINT VILLA</td>
              <td className="border border-black p-1"></td>
            </tr>
            {/* Row 3 */}
            <tr>
              <td className="border border-black p-1 font-bold">No of Villa Occupied</td>
              <td className="border border-black p-1">{data.occupied}</td>
              <td className="border border-black p-1 font-bold">ANNIVERSARY VILLAS</td>
              <td className="border border-black p-1"></td>
              <td className="border border-black p-1 font-bold">SHOWROOMS</td>
              <td className="border border-black p-1 font-bold">{data.showrooms}</td>
            </tr>
            {/* Row 4 - Complex Merged Cells */}
            <tr>
              <td className="border border-black p-1 font-bold align-top">
                <div>No of Villa Arr</div>
                <div className="mt-1">No of Villa Dep</div>
              </td>
              <td className="border border-black p-1 align-top">
                <div>{data.arrivals}</div>
                <div className="mt-1">{data.departures}</div>
              </td>
              <td className="border border-black p-1 font-bold align-top">
                <div>HONEYMOON VILLAS</div>
                <div className="mt-1">CHILDREN IN HOUSE</div>
              </td>
              <td className="border border-black p-1 align-top">
                <div>{data.honeymooners}</div>
                <div className="mt-1">{data.children}</div>
              </td>
              <td className="border border-black p-1 font-bold align-top">
                <div>DAY SHUT</div>
                <div className="mt-1">NIGHT SHUT</div>
              </td>
              <td className="border border-black p-1 align-top">
                <div>{data.dayShut}</div>
                <div className="mt-1">{data.nightShut}</div>
              </td>
            </tr>
            {/* Row 5 */}
            <tr>
              <td className="border border-black p-1 font-bold">No of Villa Moves</td>
              <td className="border border-black p-1">0</td>
              <td className="border border-black p-1 font-bold">GUEST IN HOUSE</td>
              <td className="border border-black p-1" colSpan={3}>{data.guestInHouse}</td>
            </tr>
          </tbody>
        </table>

        {/* 3. STAFF ALLOCATION HEADER */}
        <div className="mt-4 font-bold text-xs uppercase underline"></div>

        {/* 4. STAFF TABLE */}
        <table className="w-full border-collapse border border-black text-[10px] mt-1">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-black p-1 text-left w-[25%]">NAME</th>
              <th className="border border-black p-1 text-left w-[15%]">MVPN</th>
              <th className="border border-black p-1 text-left w-[45%]">AREA / STEPS</th>
              <th className="border border-black p-1 text-left w-[15%]">DUTY</th>
            </tr>
          </thead>
          <tbody>
            {data.staff.map((s, i) => (
              <tr key={i} className="h-6">
                <td className="border border-black p-1 font-bold uppercase">{s.name}</td>
                <td className="border border-black p-1">{s.mvpn}</td>
                <td className="border border-black p-1">{s.area}</td>
                <td className="border border-black p-1 uppercase">{s.duty}</td>
              </tr>
            ))}
            {/* Force extra rows to look like the full page paper if needed */}
            {[...Array(5)].map((_, i) => (
              <tr key={`empty-${i}`} className="h-6">
                 <td className="border border-black p-1">&nbsp;</td>
                 <td className="border border-black p-1">&nbsp;</td>
                 <td className="border border-black p-1">&nbsp;</td>
                 <td className="border border-black p-1">&nbsp;</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* 5. ICE REQUEST TABLE */}
        <div className="mt-4 border border-black">
          <div className="font-bold text-[10px] p-1 border-b border-black bg-white uppercase">
            Daily Ice Request
          </div>
          <div className="flex text-[9px]">
            {["ASIPPE", "BOKKU", "SHAANUBE", "BAKKA", "HAKUREY"].map((name, i) => (
              <div key={name} className={`flex-1 ${i !== 4 ? 'border-r border-black' : ''}`}>
                <div className="font-bold border-b border-black p-1 text-center bg-gray-50">{name}</div>
                <div className="h-16 p-1">
                   <div className="flex justify-between mb-2"><span>VILLA:</span> <span className="underline decoration-dotted">___</span></div>
                   <div className="flex justify-between"><span>VILLA:</span> <span className="underline decoration-dotted">___</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 6. SIGNATURES */}
        <div className="mt-8 flex justify-between px-16 text-[10px] uppercase font-bold">
          <div className="text-center">
             <div className="w-40 border-b border-black mb-1"></div>
             Prepared By: Coordinator
          </div>
          <div className="text-center">
             <div className="w-40 border-b border-black mb-1"></div>
             Approved By: Executive HSK
          </div>
        </div>

      </div>

      <style jsx global>{`
        @media print {
          @page { size: A4; margin: 10mm; }
          body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          /* Hides everything except the A4 container */
        }
      `}</style>
    </div>
  );
}