"use client";
import React, { useState, useEffect } from 'react';
import { Printer } from 'lucide-react';

export default function AllocationPage() {
  const [isClient, setIsClient] = useState(false);

  // 1. DATA STATE - This controls all the text in your SVG
  const [data, setData] = useState({
    date: "05 / 02 / 2026",
    occupancy: "81%",
    occupied: "76",
    arrivals: "13",
    departures: "10",
    moves: "1",
    
    // Middle Columns
    repeaterVillas: "21 4 93 85 26",
    birthday: "-",
    anniversary: "65",
    honeymoon: "-",
    children: "12",
    guests: "164",
    
    // Right Columns
    sinner: "39 37 28",
    saint: "-",
    showrooms: "57 36 52",
    dayShut: "-",
    nightShut1: "42 43 51",
    nightShut2: "-",

    // The "Daily Ice Request" / Dep List section (2 Columns)
    listColumn1: [
      { villa: "67", time: "14:00", dep: "28 Feb" },
      { villa: "67", time: "14:30", dep: "01 Mar" },
      { villa: "67", time: "16:40", dep: "30 Mar" },
      { villa: "67", time: "15:00", dep: "05 Apr" },
      { villa: "67", time: "12:00", dep: "06 Apr" },
    ],
    listColumn2: [
      { villa: "67", time: "14:00", dep: "28 Feb" },
      { villa: "67", time: "14:00", dep: "28 Feb" },
      { villa: "67", time: "14:00", dep: "28 Feb" },
      { villa: "67", time: "14:00", dep: "28 Feb" },
      { villa: "67", time: "14:00", dep: "28 Feb" },
    ]
  });

  // 2. STAFF LIST (HTML Table below the SVG)
  const staffList = [
    { name: "Jeeth", mvpn: "2968", area: "Jetty A, B, C", duty: "AM/PM" },
    { name: "Abow", mvpn: "2962", area: "87, 91-97", duty: "MORNING" },
    { name: "Shamil", mvpn: "3035", area: "57, 82-86, 89, 90", duty: "MORNING" },
    { name: "Eeku", mvpn: "2964", area: "36, 51-55, 80, 81", duty: "NIGHT" },
    { name: "Maah", mvpn: "2842", area: "Floater", duty: "MORNING" },
    { name: "Adam", mvpn: "2731", area: "Support", duty: "MORNING" },
    { name: "Ziyatte", mvpn: "2836", area: "BOH", duty: "MORNING" },
  ];

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) return null;

  return (
    <div className="min-h-screen bg-gray-100 p-8 flex flex-col items-center font-serif">
      
      {/* CONTROL BAR */}
      <div className="w-full max-w-[210mm] flex justify-between items-center mb-6 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-[#6D2158]">Allocation Report</h1>
          <p className="text-sm text-gray-500">Illustrator SVG Template</p>
        </div>
        <button 
          onClick={() => window.print()}
          className="bg-[#6D2158] text-white px-6 py-2 rounded font-bold flex gap-2 hover:bg-[#501840]"
        >
          <Printer size={18} /> Print Form
        </button>
      </div>

      {/* --- A4 PAPER START --- */}
      <div className="bg-white shadow-xl print:shadow-none w-[210mm] min-h-[297mm] p-[10mm] print:p-0 print:m-0 relative">
        
        {/* 1. YOUR SVG HEADER (Cropped to show only the header part) */}
        {/* I set viewBox height to 120 to cut off the empty bottom of the Artboard */}
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          version="1.1" 
          viewBox="0 0 595.3 115" 
          className="w-full"
        >
          <defs>
            <style>{`
              .st0, .st1 { font-family: 'Book Antiqua', Palatino, serif; fill: #fff; }
              .st0, .st2 { font-size: 10px; }
              .st1 { font-size: 5px; }
              .st3 { font-size: 6px; }
              .st3, .st2 { font-family: 'Book Antiqua', Palatino, serif; font-weight: 700; fill: #000; }
              .st4, .st5 { fill: none; stroke: #000; stroke-miterlimit: 10; }
              .st4, .st7 { stroke-width: 0.5px; }
              .st5, .st6 { stroke-width: 0.1px; }
              .st6, .st7 { fill: #6d2158; }
            `}</style>
          </defs>
          
          <g id="OUTLINE">
            <polygon className="st5" points="578.7 43.9 578.7 54 578.4 54 578.4 44 549.9 44 549.9 54 521.4 54 521.4 44 472.8 44 472.8 54 444.3 54 444.3 44 16.6 44 16.6 43.9 578.7 43.9"/>
            <rect className="st7" x="16.6" y="31.2" width="407.7" height="12.7"/>
            <rect className="st7" x="424.3" y="31.2" width="154.3" height="12.7"/>
            <rect className="st5" x="16.6" y="44" width="407.7" height="10"/>
            <rect className="st5" x="16.6" y="54" width="427.7" height="10"/>
            <rect className="st5" x="16.6" y="64" width="427.7" height="10"/>
            <rect className="st5" x="16.6" y="74" width="427.7" height="10"/>
            <rect className="st5" x="16.6" y="84.1" width="427.7" height="10"/>
            <rect className="st5" x="16.6" y="94.1" width="427.7" height="10"/>
            
            {/* Right Side Grid */}
            <rect className="st5" x="444.3" y="54" width="134.3" height="10"/>
            <rect className="st5" x="444.3" y="64" width="134.3" height="10"/>
            <rect className="st5" x="444.3" y="74" width="134.3" height="10"/>
            <rect className="st5" x="444.3" y="84.1" width="134.3" height="10"/>
            <rect className="st5" x="444.3" y="94.1" width="134.3" height="10"/>
            
            <rect className="st5" x="97" y="43.9" width="53.4" height="60.2"/>
            <rect className="st6" x="424.3" y="44" width="154.5" height="10"/>
            <rect className="st5" x="230.5" y="44" width="73.8" height="60.1"/>
            <rect className="st5" x="373.3" y="44" width="51" height="60.1"/>
            <rect className="st5" x="501.4" y="54" width="20" height="50.1"/>
            <rect className="st5" x="472.8" y="54" width="28.5" height="50.1"/>
            <rect className="st5" x="550.3" y="54" width="28.5" height="50.1"/>
            <line className="st4" x1="424.3" y1="31.2" x2="424.3" y2="104.1"/>
            <line className="st4" x1="578.7" y1="108.1" x2="578.7" y2="31.2"/>
            <line className="st5" x1="444.3" y1="58.3" x2="444.3" y2="44"/>
            <line className="st5" x1="472.8" y1="58.3" x2="472.8" y2="44"/>
            <line className="st5" x1="501.4" y1="57.6" x2="501.4" y2="43.9"/>
            <line className="st5" x1="521.4" y1="58.2" x2="521.4" y2="44"/>
            <line className="st5" x1="550.3" y1="57.3" x2="550.3" y2="43.9"/>
          </g>

          <g id="HEADINGS">
            <text className="st2" transform="translate(120.2 41.2)">HOUSEKEEPING ALLOCATION REPORT</text>
            <text className="st0" transform="translate(451.9 41.2)">DAILY ICE REQUEST</text>
            <text className="st1" transform="translate(426.6 50.8)">VILLA</text>
            <text className="st1" transform="translate(503.7 50.8)">VILLA</text>
            <text className="st1" transform="translate(452.3 50.8)">TIME</text>
            <text className="st1" transform="translate(529.4 50.8)">TIME</text>
            <text className="st1" transform="translate(482.1 50.8)">DEP</text>
            <text className="st1" transform="translate(559.3 50.7)">DEP</text>
            
            {/* Left Headers */}
            <text className="st3" transform="translate(18.3 51.2)">DATE</text>
            <text className="st3" transform="translate(18.3 61.2)">DAILY OCCUPANCY %</text>
            <text className="st3" transform="translate(18.3 71.2)">NO OF VILLA OCCUPIED</text>
            <text className="st3" transform="translate(18.3 81.2)">NO OF VILLA ARR</text>
            <text className="st3" transform="translate(18.3 91.2)">NO OF VILLA DEP</text>
            <text className="st3" transform="translate(18.3 101.3)">NO OF VILLA MOVES</text>
            
            {/* Middle Headers */}
            <text className="st3" transform="translate(151.8 51.2)">REPEATER VILLAS</text>
            <text className="st3" transform="translate(151.8 61.2)">BIRTHDAY VILLAS</text>
            <text className="st3" transform="translate(151.8 71.2)">ANNIVERSARY VILLAS</text>
            <text className="st3" transform="translate(151.8 81.2)">HONEYMOON VILLAS</text>
            <text className="st3" transform="translate(151.8 91.2)">CHILDREN IN HOUSE</text>
            <text className="st3" transform="translate(151.8 101.2)">GUEST IN HOUSE</text>
            
            {/* Right Headers */}
            <text className="st3" transform="translate(306.8 51.2)">SINNER VILLA</text>
            <text className="st3" transform="translate(306.8 61.2)">SAINT VILLA</text>
            <text className="st3" transform="translate(306.8 71.2)">SHOWROOMS</text>
            <text className="st3" transform="translate(306.8 81.2)">DAY SHUT</text>
            <text className="st3" transform="translate(306.8 91.3)">NIGHT SHUT #1</text>
            <text className="st3" transform="translate(306.8 101.3)">NIGHT SHUT #2</text>
          </g>

          {/* =========================================================
              DYNAMIC DATA MAPPING (Injecting React Variables)
             ========================================================= */}
          <g id="PLACE_HOLDER">
            {/* Col 1 */}
            <text className="st3" transform="translate(107.7 51.2)" fill="red">{data.date}</text>
            <text className="st3" transform="translate(118.1 61.2)">{data.occupancy}</text>
            <text className="st3" transform="translate(120.7 71.2)">{data.occupied}</text>
            <text className="st3" transform="translate(120.7 81.2)">{data.arrivals}</text>
            <text className="st3" transform="translate(120.7 91.2)">{data.departures}</text>
            <text className="st3" transform="translate(122.2 101.3)">{data.moves}</text>

            {/* Col 2 */}
            <text className="st3" transform="translate(250.8 51.2)">{data.repeaterVillas}</text>
            <text className="st3" transform="translate(266.3 61.2)">{data.birthday}</text>
            <text className="st3" transform="translate(264.3 71.2)">{data.anniversary}</text>
            <text className="st3" transform="translate(266.3 81.2)">{data.honeymoon}</text>
            <text className="st3" transform="translate(264.3 91.2)">{data.children}</text>
            <text className="st3" transform="translate(262.8 101.3)">{data.guests}</text>

            {/* Col 3 */}
            <text className="st3" transform="translate(388.3 51.2)">{data.sinner}</text>
            <text className="st3" transform="translate(397.8 61.2)">{data.saint}</text>
            <text className="st3" transform="translate(388.3 71.2)">{data.showrooms}</text>
            <text className="st3" transform="translate(397.8 81.2)">{data.dayShut}</text>
            <text className="st3" transform="translate(388.3 91.2)">{data.nightShut1}</text>
            <text className="st3" transform="translate(397.8 101.3)">{data.nightShut2}</text>

            {/* List Column 1 (Dynamic Mapping) */}
            {data.listColumn1.map((item, i) => (
              <g key={i}>
                <text className="st3" transform={`translate(431.5 ${61.2 + (i * 10)})`}>{item.villa}</text>
                <text className="st3" transform={`translate(451.8 ${61.2 + (i * 10)})`}>{item.time}</text>
                <text className="st3" transform={`translate(478.3 ${61.2 + (i * 10)})`}>{item.dep}</text>
              </g>
            ))}

            {/* List Column 2 (Dynamic Mapping) */}
            {data.listColumn2.map((item, i) => (
              <g key={i}>
                <text className="st3" transform={`translate(508.4 ${61.2 + (i * 10)})`}>{item.villa}</text>
                <text className="st3" transform={`translate(529.1 ${61.2 + (i * 10)})`}>{item.time}</text>
                <text className="st3" transform={`translate(555.6 ${61.2 + (i * 10)})`}>{item.dep}</text>
              </g>
            ))}
          </g>
        </svg>

        {/* 2. THE HTML STAFF TABLE (For Flexibility) */}
        <div className="mt-2">
          <table className="w-full border-collapse border border-black text-[10px]">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-black p-1 w-[20%] text-left">NAME</th>
                <th className="border border-black p-1 w-[10%] text-left">MVPN</th>
                <th className="border border-black p-1 w-[55%] text-left">AREA / STEPS</th>
                <th className="border border-black p-1 w-[15%] text-left">DUTY</th>
              </tr>
            </thead>
            <tbody>
              {staffList.map((s, i) => (
                <tr key={i} className="h-6">
                  <td className="border border-black p-1 font-bold uppercase">{s.name}</td>
                  <td className="border border-black p-1">{s.mvpn}</td>
                  <td className="border border-black p-1 font-medium">{s.area}</td>
                  <td className="border border-black p-1 uppercase">{s.duty}</td>
                </tr>
              ))}
              {/* Extra rows for layout padding */}
              {[...Array(5)].map((_, i) => (
                <tr key={`fill-${i}`} className="h-6">
                  <td className="border border-black p-1"></td>
                  <td className="border border-black p-1"></td>
                  <td className="border border-black p-1"></td>
                  <td className="border border-black p-1"></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 3. FOOTER SIGNATURES */}
        <div className="mt-8 flex justify-between px-16 text-[10px] uppercase font-bold">
           <div className="text-center">
              <div className="w-40 border-b border-black mb-1"></div>
              Prepared By: Coordinator
           </div>
           <div className="text-center">
              <div className="w-40 border-b border-black mb-1"></div>
              Approved By: Exec. HSK
           </div>
        </div>

      </div>

      <style jsx global>{`
        @media print {
          @page { size: A4; margin: 0; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </div>
  );
}