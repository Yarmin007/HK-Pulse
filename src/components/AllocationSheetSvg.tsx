"use client";

import React from "react";

export interface AllocationSheetData {
  summary: {
    report_date?: string;
    occupancy_pct?: number | string;
    occupied_count?: number | string;
    arrivals_count?: number | string;
    departures_count?: number | string;
    villa_moves?: number | string;
    repeater_villas?: string;
    birthday_villas?: string;
    anniversary_villas?: string;
    honeymoon_villas?: string;
    children_count?: number | string;
    guest_in_house?: number | string;
    deep_clean?: string;
    deck_clean?: string;
    oos_villas?: string;
    maintenance_villas?: string;
    pmp_villas?: string;
    sinner_villa?: string;
    saint_villa?: string;
    show_villa?: string;
    day_shut?: string;
    night_shut_1?: string;
    night_shut_2?: string;
  };
  iceRequests: Array<{
    villa?: string | number;
    time?: string;
    dep?: string;
  }>;
  jettyA: Array<{
    name: string;
    contact: string;
    villas: Array<{ number: string | number; status: string }>;
  }>;
  jettyB: Array<{
    name: string;
    contact: string;
    villas: Array<{ number: string | number; status: string }>;
  }>;
  jettyC: Array<{
    name: string;
    contact: string;
    villas: Array<{ number: string | number; status: string }>;
  }>;
  beach: Array<{
    name: string;
    contact: string;
    villas: Array<{ number: string | number; status: string }>;
  }>;
  pool: {
    hosts: Array<{ name: string; mvpn: string; allocation: string }>;
    night: string[];
    mod: string[];
    continueShift: string[];
  };
  publicArea: {
    morningFoh: string[];
    morningBoh: string[];
    afternoonFoh: string[];
    afternoonBoh: string[];
    specialTasks: string[];
  };
  admin: Array<{ name: string; contact: string }>;
  tailor: Array<{ name: string; no: string }>;
  housemate: Array<{ name: string; no: string }>;
  runnerStepLuggage: {
    runner: Array<{ name: string; duty: string; mvpn: string }>;
    step: Array<{ name: string; duty: string; mvpn: string }>;
    luggage: Array<{ name: string; duty: string; mvpn: string }>;
  };
  garden: {
    incharge: { name: string; contact: string };
    hosts: Array<{ name: string; contact: string; area: string }>;
  };
  laundry: Array<{ name: string; no: string }>;
  pestControl: Array<{ name: string; no: string }>;
  specialTasks: {
    task1: string;
    task2: string;
    task3: string;
    task4: string;
    deepVilla: string;
    oooVilla: string;
    huVilla: string;
  };
  annualLeave: Array<{ name: string; from: string; to: string; duration: string | number }>;
  sickLeave: Array<{ name: string; from: string; to: string; duration: string | number }>;
  dayOff: Array<{ name: string; from: string; to: string; duration: string | number }>;
}

const formatTwoDigit = (val: any) => {
  if (val === undefined || val === null || val === "" || isNaN(Number(val))) return val || "";
  return String(val).padStart(2, "0");
};

const formatDateDdMm = (dateStr?: string) => {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}`;
  return dateStr;
};

export default function AllocationSheetSvg({ data }: { data: AllocationSheetData }) {
  const d = data;
  const s = d.summary || {};

  // Tier 1: Jetty A (7 columns)
  const t1 = [...(d.jettyA || [])];
  while (t1.length < 7) t1.push({ name: "", contact: "", villas: [] });

  // Tier 2: Jetty B (3 cols) + Jetty C (4 cols) = 7 columns
  const t2 = [...(d.jettyB || []).slice(0, 3), ...(d.jettyC || []).slice(0, 4)];
  while (t2.length < 7) t2.push({ name: "", contact: "", villas: [] });

  // Tier 3: Beach (7 columns)
  const t3 = [...(d.beach || [])];
  while (t3.length < 7) t3.push({ name: "", contact: "", villas: [] });

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 595.28 841.89" className="w-full h-auto">
      <defs>
        <style>{`
          .cls-1, .cls-2, .cls-3, .cls-4, .cls-5, .cls-6, .cls-7, .cls-8, .cls-9, .cls-10, .cls-11 {
            font-family: BookAntiqua-Bold, 'Book Antiqua';
            font-weight: 700;
          }
          .cls-1, .cls-4, .cls-7, .cls-9 {
            fill: #231f20;
          }
          .cls-1, .cls-5 {
            font-size: 5px;
          }
          .cls-2 {
            font-size: 6px;
          }
          .cls-2, .cls-3, .cls-5, .cls-6, .cls-8, .cls-10, .cls-11 {
            fill: #fff;
          }
          .cls-3 {
            font-size: 8.24px;
          }
          .cls-12 {
            stroke-width: .2px;
          }
          .cls-12, .cls-13, .cls-14 {
            stroke: #231f20;
            stroke-miterlimit: 10;
          }
          .cls-12, .cls-14 {
            fill: none;
          }
          .cls-13 {
            fill: #691c56;
          }
          .cls-13, .cls-14 {
            stroke-width: .75px;
          }
          .cls-4 {
            font-size: 6.78px;
          }
          .cls-6 {
            font-size: 6.07px;
          }
          .cls-7 {
            font-size: 4.55px;
          }
          .cls-8 {
            font-size: 6.84px;
          }
          .cls-9 {
            font-size: 4.55px;
          }
          .cls-10 {
            font-size: 4.61px;
          }
          .cls-11 {
            font-size: 6.73px;
          }
        `}</style>
      </defs>

      {/* ========================================================================= */}
      {/* 1. STRUCTURE (100% UNTOUCHED ORIGINAL RECTANGLES FROM ILLUSTRATOR)        */}
      {/* ========================================================================= */}
      <g id="STRUCTURE">
        <rect className="cls-14" x="9" y="10.59" width="577.53" height="75.29"/>
        <rect className="cls-13" x="9" y="10.59" width="439.76" height="12.82"/>
        <rect className="cls-13" x="9" y="85.88" width="577.53" height="11.53"/>
        <rect className="cls-13" x="9" y="97.41" width="82.5" height="11.53"/>
        <rect className="cls-14" x="9" y="97.41" width="82.5" height="164.24"/>
        <rect className="cls-14" x="91.5" y="97.41" width="82.5" height="164.24"/>
        <rect className="cls-14" x="174.01" y="97.41" width="82.5" height="164.24"/>
        <rect className="cls-14" x="256.51" y="97.41" width="82.5" height="164.24"/>
        <rect className="cls-14" x="421.52" y="97.41" width="82.5" height="164.24"/>
        <rect className="cls-14" x="504.03" y="97.41" width="82.5" height="164.24"/>
        <rect className="cls-12" x="9" y="118.71" width="27.53" height="15.88"/>
        <rect className="cls-12" x="9" y="134.59" width="27.53" height="15.88"/>
        <rect className="cls-12" x="9" y="150.47" width="27.53" height="15.88"/>
        <rect className="cls-12" x="9" y="166.35" width="27.53" height="15.88"/>
        <rect className="cls-12" x="9" y="182.24" width="27.53" height="15.88"/>
        <rect className="cls-12" x="9" y="198.12" width="27.53" height="15.88"/>
        <rect className="cls-12" x="9" y="214" width="27.53" height="15.88"/>
        <rect className="cls-12" x="9" y="229.88" width="27.53" height="15.88"/>
        <rect className="cls-12" x="9" y="245.76" width="27.53" height="15.88"/>
        <rect className="cls-12" x="36.53" y="118.71" width="54.97" height="15.88"/>
        <rect className="cls-12" x="36.53" y="134.59" width="54.97" height="15.88"/>
        <rect className="cls-12" x="36.53" y="150.47" width="54.97" height="15.88"/>
        <rect className="cls-12" x="36.53" y="166.35" width="54.97" height="15.88"/>
        <rect className="cls-12" x="36.53" y="182.24" width="54.97" height="15.88"/>
        <rect className="cls-12" x="36.53" y="198.12" width="54.97" height="15.88"/>
        <rect className="cls-12" x="36.53" y="214" width="54.97" height="15.88"/>
        <rect className="cls-12" x="36.53" y="229.88" width="54.97" height="15.88"/>
        <rect className="cls-12" x="36.53" y="245.76" width="54.97" height="15.88"/>
        <rect className="cls-13" x="9" y="108.94" width="27.53" height="9.76"/>
        <rect className="cls-13" x="36.53" y="108.94" width="54.97" height="9.76"/>
        <rect className="cls-12" x="9" y="294.47" width="27.53" height="15.88"/>
        <rect className="cls-12" x="9" y="310.35" width="27.53" height="15.88"/>
        <rect className="cls-12" x="9" y="326.24" width="27.53" height="15.88"/>
        <rect className="cls-12" x="9" y="342.12" width="27.53" height="15.88"/>
        <rect className="cls-12" x="9" y="358" width="27.53" height="15.88"/>
        <rect className="cls-12" x="9" y="373.88" width="27.53" height="15.88"/>
        <rect className="cls-12" x="9" y="389.76" width="27.53" height="15.88"/>
        <rect className="cls-12" x="9" y="405.65" width="27.53" height="15.88"/>
        <rect className="cls-12" x="36.53" y="294.47" width="54.97" height="15.88"/>
        <rect className="cls-12" x="36.53" y="310.35" width="54.97" height="15.88"/>
        <rect className="cls-12" x="36.53" y="326.24" width="54.97" height="15.88"/>
        <rect className="cls-12" x="36.53" y="342.12" width="54.97" height="15.88"/>
        <rect className="cls-12" x="36.53" y="358" width="54.97" height="15.88"/>
        <rect className="cls-12" x="36.53" y="373.88" width="54.97" height="15.88"/>
        <rect className="cls-12" x="36.53" y="389.76" width="54.97" height="15.88"/>
        <rect className="cls-12" x="36.53" y="405.65" width="54.97" height="15.88"/>
        <rect className="cls-13" x="9" y="284.71" width="27.53" height="9.76"/>
        <rect className="cls-13" x="36.53" y="284.71" width="54.97" height="9.76"/>
        <rect className="cls-12" x="91.5" y="294.47" width="27.53" height="15.88"/>
        <rect className="cls-12" x="91.5" y="310.35" width="27.53" height="15.88"/>
        <rect className="cls-12" x="91.5" y="326.24" width="27.53" height="15.88"/>
        <rect className="cls-12" x="91.5" y="342.12" width="27.53" height="15.88"/>
        <rect className="cls-12" x="91.5" y="358" width="27.53" height="15.88"/>
        <rect className="cls-12" x="91.5" y="373.88" width="27.53" height="15.88"/>
        <rect className="cls-12" x="91.5" y="389.76" width="27.53" height="15.88"/>
        <rect className="cls-12" x="91.5" y="405.65" width="27.53" height="15.88"/>
        <rect className="cls-12" x="119.03" y="294.47" width="54.97" height="15.88"/>
        <rect className="cls-12" x="119.03" y="310.35" width="54.97" height="15.88"/>
        <rect className="cls-12" x="119.03" y="326.24" width="54.97" height="15.88"/>
        <rect className="cls-12" x="119.03" y="342.12" width="54.97" height="15.88"/>
        <rect className="cls-12" x="119.03" y="358" width="54.97" height="15.88"/>
        <rect className="cls-12" x="119.03" y="373.88" width="54.97" height="15.88"/>
        <rect className="cls-12" x="119.03" y="389.76" width="54.97" height="15.88"/>
        <rect className="cls-12" x="119.03" y="405.65" width="54.97" height="15.88"/>
        <rect className="cls-13" x="91.5" y="284.71" width="27.53" height="9.76"/>
        <rect className="cls-13" x="119.03" y="284.71" width="54.97" height="9.76"/>
        <rect className="cls-12" x="174.01" y="294.47" width="27.53" height="15.88"/>
        <rect className="cls-12" x="174.01" y="310.35" width="27.53" height="15.88"/>
        <rect className="cls-12" x="174.01" y="326.24" width="27.53" height="15.88"/>
        <rect className="cls-12" x="174.01" y="342.12" width="27.53" height="15.88"/>
        <rect className="cls-12" x="174.01" y="358" width="27.53" height="15.88"/>
        <rect className="cls-12" x="174.01" y="373.88" width="27.53" height="15.88"/>
        <rect className="cls-12" x="174.01" y="389.76" width="27.53" height="15.88"/>
        <rect className="cls-12" x="174.01" y="405.65" width="27.53" height="15.88"/>
        <rect className="cls-12" x="201.54" y="294.47" width="54.97" height="15.88"/>
        <rect className="cls-12" x="201.54" y="310.35" width="54.97" height="15.88"/>
        <rect className="cls-12" x="201.54" y="326.24" width="54.97" height="15.88"/>
        <rect className="cls-12" x="201.54" y="342.12" width="54.97" height="15.88"/>
        <rect className="cls-12" x="201.54" y="358" width="54.97" height="15.88"/>
        <rect className="cls-12" x="201.54" y="373.88" width="54.97" height="15.88"/>
        <rect className="cls-12" x="201.54" y="389.76" width="54.97" height="15.88"/>
        <rect className="cls-12" x="201.54" y="405.65" width="54.97" height="15.88"/>
        <rect className="cls-13" x="174.01" y="284.71" width="27.53" height="9.76"/>
        <rect className="cls-13" x="201.54" y="284.71" width="54.97" height="9.76"/>
        <rect className="cls-12" x="91.5" y="118.71" width="27.53" height="15.88"/>
        <rect className="cls-12" x="91.5" y="134.59" width="27.53" height="15.88"/>
        <rect className="cls-12" x="91.5" y="150.47" width="27.53" height="15.88"/>
        <rect className="cls-12" x="91.5" y="166.35" width="27.53" height="15.88"/>
        <rect className="cls-12" x="91.5" y="182.24" width="27.53" height="15.88"/>
        <rect className="cls-12" x="91.5" y="198.12" width="27.53" height="15.88"/>
        <rect className="cls-12" x="91.5" y="214" width="27.53" height="15.88"/>
        <rect className="cls-12" x="91.5" y="229.88" width="27.53" height="15.88"/>
        <rect className="cls-12" x="91.5" y="245.76" width="27.53" height="15.88"/>
        <rect className="cls-12" x="119.03" y="118.71" width="54.97" height="15.88"/>
        <rect className="cls-12" x="119.03" y="134.59" width="54.97" height="15.88"/>
        <rect className="cls-12" x="119.03" y="150.47" width="54.97" height="15.88"/>
        <rect className="cls-12" x="119.03" y="166.35" width="54.97" height="15.88"/>
        <rect className="cls-12" x="119.03" y="182.24" width="54.97" height="15.88"/>
        <rect className="cls-12" x="119.03" y="198.12" width="54.97" height="15.88"/>
        <rect className="cls-12" x="119.03" y="214" width="54.97" height="15.88"/>
        <rect className="cls-12" x="119.03" y="229.88" width="54.97" height="15.88"/>
        <rect className="cls-12" x="119.03" y="245.76" width="54.97" height="15.88"/>
        <rect className="cls-13" x="91.5" y="108.94" width="27.53" height="9.76"/>
        <rect className="cls-13" x="119.03" y="108.94" width="54.97" height="9.76"/>
        <rect className="cls-12" x="174.01" y="118.71" width="27.53" height="15.88"/>
        <rect className="cls-12" x="174.01" y="134.59" width="27.53" height="15.88"/>
        <rect className="cls-12" x="174.01" y="150.47" width="27.53" height="15.88"/>
        <rect className="cls-12" x="174.01" y="166.35" width="27.53" height="15.88"/>
        <rect className="cls-12" x="174.01" y="182.24" width="27.53" height="15.88"/>
        <rect className="cls-12" x="174.01" y="198.12" width="27.53" height="15.88"/>
        <rect className="cls-12" x="174.01" y="214" width="27.53" height="15.88"/>
        <rect className="cls-12" x="174.01" y="229.88" width="27.53" height="15.88"/>
        <rect className="cls-12" x="174.01" y="245.76" width="27.53" height="15.88"/>
        <rect className="cls-12" x="201.54" y="118.71" width="54.97" height="15.88"/>
        <rect className="cls-12" x="201.54" y="134.59" width="54.97" height="15.88"/>
        <rect className="cls-12" x="201.54" y="150.47" width="54.97" height="15.88"/>
        <rect className="cls-12" x="201.54" y="166.35" width="54.97" height="15.88"/>
        <rect className="cls-12" x="201.54" y="182.24" width="54.97" height="15.88"/>
        <rect className="cls-12" x="201.54" y="198.12" width="54.97" height="15.88"/>
        <rect className="cls-12" x="201.54" y="214" width="54.97" height="15.88"/>
        <rect className="cls-12" x="201.54" y="229.88" width="54.97" height="15.88"/>
        <rect className="cls-12" x="201.54" y="245.76" width="54.97" height="15.88"/>
        <rect className="cls-13" x="174.01" y="108.94" width="27.53" height="9.76"/>
        <rect className="cls-13" x="201.54" y="108.94" width="54.97" height="9.76"/>
        <rect className="cls-12" x="256.51" y="118.71" width="27.53" height="15.88"/>
        <rect className="cls-12" x="256.51" y="134.59" width="27.53" height="15.88"/>
        <rect className="cls-12" x="256.51" y="150.47" width="27.53" height="15.88"/>
        <rect className="cls-12" x="256.51" y="166.35" width="27.53" height="15.88"/>
        <rect className="cls-12" x="256.51" y="182.24" width="27.53" height="15.88"/>
        <rect className="cls-12" x="256.51" y="198.12" width="27.53" height="15.88"/>
        <rect className="cls-12" x="256.51" y="214" width="27.53" height="15.88"/>
        <rect className="cls-12" x="256.51" y="229.88" width="27.53" height="15.88"/>
        <rect className="cls-12" x="256.51" y="245.76" width="27.53" height="15.88"/>
        <rect className="cls-12" x="284.04" y="118.71" width="54.97" height="15.88"/>
        <rect className="cls-12" x="284.04" y="134.59" width="54.97" height="15.88"/>
        <rect className="cls-12" x="284.04" y="150.47" width="54.97" height="15.88"/>
        <rect className="cls-12" x="284.04" y="166.35" width="54.97" height="15.88"/>
        <rect className="cls-12" x="284.04" y="182.24" width="54.97" height="15.88"/>
        <rect className="cls-12" x="284.04" y="198.12" width="54.97" height="15.88"/>
        <rect className="cls-12" x="284.04" y="214" width="54.97" height="15.88"/>
        <rect className="cls-12" x="284.04" y="229.88" width="54.97" height="15.88"/>
        <rect className="cls-12" x="284.04" y="245.76" width="54.97" height="15.88"/>
        <rect className="cls-13" x="256.51" y="108.94" width="27.53" height="9.76"/>
        <rect className="cls-13" x="284.04" y="108.94" width="54.97" height="9.76"/>
        <rect className="cls-12" x="339.02" y="118.71" width="27.53" height="15.88"/>
        <rect className="cls-12" x="339.02" y="134.59" width="27.53" height="15.88"/>
        <rect className="cls-12" x="339.02" y="150.47" width="27.53" height="15.88"/>
        <rect className="cls-12" x="339.02" y="166.35" width="27.53" height="15.88"/>
        <rect className="cls-12" x="339.02" y="182.24" width="27.53" height="15.88"/>
        <rect className="cls-12" x="339.02" y="198.12" width="27.53" height="15.88"/>
        <rect className="cls-12" x="339.02" y="214" width="27.53" height="15.88"/>
        <rect className="cls-12" x="339.02" y="229.88" width="27.53" height="15.88"/>
        <rect className="cls-12" x="339.02" y="245.76" width="27.53" height="15.88"/>
        <rect className="cls-12" x="366.55" y="118.71" width="54.97" height="15.88"/>
        <rect className="cls-12" x="366.55" y="134.59" width="54.97" height="15.88"/>
        <rect className="cls-12" x="366.55" y="150.47" width="54.97" height="15.88"/>
        <rect className="cls-12" x="366.55" y="166.35" width="54.97" height="15.88"/>
        <rect className="cls-12" x="366.55" y="182.24" width="54.97" height="15.88"/>
        <rect className="cls-12" x="366.55" y="198.12" width="54.97" height="15.88"/>
        <rect className="cls-12" x="366.55" y="214" width="54.97" height="15.88"/>
        <rect className="cls-12" x="366.55" y="229.88" width="54.97" height="15.88"/>
        <rect className="cls-12" x="366.55" y="245.76" width="54.97" height="15.88"/>
        <rect className="cls-13" x="339.02" y="108.94" width="27.53" height="9.76"/>
        <rect className="cls-13" x="366.55" y="108.94" width="54.97" height="9.76"/>
        <rect className="cls-12" x="421.52" y="118.71" width="27.53" height="15.88"/>
        <rect className="cls-12" x="421.52" y="134.59" width="27.53" height="15.88"/>
        <rect className="cls-12" x="421.52" y="150.47" width="27.53" height="15.88"/>
        <rect className="cls-12" x="421.52" y="166.35" width="27.53" height="15.88"/>
        <rect className="cls-12" x="421.52" y="182.24" width="27.53" height="15.88"/>
        <rect className="cls-12" x="421.52" y="198.12" width="27.53" height="15.88"/>
        <rect className="cls-12" x="421.52" y="214" width="27.53" height="15.88"/>
        <rect className="cls-12" x="421.52" y="229.88" width="27.53" height="15.88"/>
        <rect className="cls-12" x="421.52" y="245.76" width="27.53" height="15.88"/>
        <rect className="cls-12" x="449.05" y="118.71" width="54.97" height="15.88"/>
        <rect className="cls-12" x="449.05" y="134.59" width="54.97" height="15.88"/>
        <rect className="cls-12" x="449.05" y="150.47" width="54.97" height="15.88"/>
        <rect className="cls-12" x="449.05" y="166.35" width="54.97" height="15.88"/>
        <rect className="cls-12" x="449.05" y="182.24" width="54.97" height="15.88"/>
        <rect className="cls-12" x="449.05" y="198.12" width="54.97" height="15.88"/>
        <rect className="cls-12" x="449.05" y="214" width="54.97" height="15.88"/>
        <rect className="cls-12" x="449.05" y="229.88" width="54.97" height="15.88"/>
        <rect className="cls-12" x="449.05" y="245.76" width="54.97" height="15.88"/>
        <rect className="cls-13" x="421.52" y="108.94" width="27.53" height="9.76"/>
        <rect className="cls-13" x="449.05" y="108.94" width="54.97" height="9.76"/>
        <rect className="cls-12" x="504.03" y="118.71" width="27.53" height="15.88"/>
        <rect className="cls-12" x="504.03" y="134.59" width="27.53" height="15.88"/>
        <rect className="cls-12" x="504.03" y="150.47" width="27.53" height="15.88"/>
        <rect className="cls-12" x="504.03" y="166.35" width="27.53" height="15.88"/>
        <rect className="cls-12" x="504.03" y="182.24" width="27.53" height="15.88"/>
        <rect className="cls-12" x="504.03" y="198.12" width="27.53" height="15.88"/>
        <rect className="cls-12" x="504.03" y="214" width="27.53" height="15.88"/>
        <rect className="cls-12" x="504.03" y="229.88" width="27.53" height="15.88"/>
        <rect className="cls-12" x="504.03" y="245.76" width="27.53" height="15.88"/>
        <rect className="cls-12" x="531.55" y="118.71" width="54.97" height="15.88"/>
        <rect className="cls-12" x="531.55" y="134.59" width="54.97" height="15.88"/>
        <rect className="cls-12" x="531.55" y="150.47" width="54.97" height="15.88"/>
        <rect className="cls-12" x="531.55" y="166.35" width="54.97" height="15.88"/>
        <rect className="cls-12" x="531.55" y="182.24" width="54.97" height="15.88"/>
        <rect className="cls-12" x="531.55" y="198.12" width="54.97" height="15.88"/>
        <rect className="cls-12" x="531.55" y="214" width="54.97" height="15.88"/>
        <rect className="cls-12" x="531.55" y="229.88" width="54.97" height="15.88"/>
        <rect className="cls-12" x="531.55" y="245.76" width="54.97" height="15.88"/>
        <rect className="cls-13" x="504.03" y="108.94" width="27.53" height="9.76"/>
        <rect className="cls-13" x="531.55" y="108.94" width="54.97" height="9.76"/>
        <rect className="cls-13" x="91.5" y="97.41" width="82.5" height="11.53"/>
        <rect className="cls-13" x="174.01" y="97.41" width="82.5" height="11.53"/>
        <rect className="cls-13" x="256.51" y="97.41" width="82.5" height="11.53"/>
        <rect className="cls-13" x="339.02" y="97.41" width="82.5" height="11.53"/>
        <rect className="cls-13" x="421.52" y="97.41" width="82.5" height="11.53"/>
        <rect className="cls-13" x="504.03" y="97.41" width="82.5" height="11.53"/>
        <rect className="cls-13" x="9" y="261.65" width="247.51" height="11.53"/>
        <rect className="cls-13" x="256.51" y="261.65" width="330.02" height="11.53"/>
        <rect className="cls-13" x="9" y="273.18" width="82.5" height="11.53"/>
        <rect className="cls-14" x="9" y="273.18" width="82.5" height="148.35"/>
        <rect className="cls-14" x="91.5" y="273.18" width="82.5" height="148.35"/>
        <rect className="cls-14" x="339.02" y="273.18" width="82.5" height="148.35"/>
        <rect className="cls-14" x="421.52" y="273.18" width="82.5" height="148.35"/>
        <rect className="cls-14" x="174.01" y="273.18" width="82.5" height="148.35"/>
        <rect className="cls-12" x="256.51" y="294.47" width="27.4" height="15.88"/>
        <rect className="cls-12" x="256.51" y="310.35" width="27.4" height="15.88"/>
        <rect className="cls-12" x="256.51" y="326.24" width="27.4" height="15.88"/>
        <rect className="cls-12" x="256.51" y="342.12" width="27.4" height="15.88"/>
        <rect className="cls-12" x="256.51" y="358" width="27.4" height="15.88"/>
        <rect className="cls-12" x="256.51" y="373.88" width="27.4" height="15.88"/>
        <rect className="cls-12" x="256.51" y="389.76" width="27.4" height="15.88"/>
        <rect className="cls-12" x="256.51" y="405.65" width="27.4" height="15.88"/>
        <rect className="cls-12" x="283.92" y="294.47" width="55.1" height="15.88"/>
        <rect className="cls-12" x="283.92" y="310.35" width="55.1" height="15.88"/>
        <rect className="cls-12" x="283.92" y="326.24" width="55.1" height="15.88"/>
        <rect className="cls-12" x="283.92" y="342.12" width="55.1" height="15.88"/>
        <rect className="cls-12" x="283.92" y="358" width="55.1" height="15.88"/>
        <rect className="cls-12" x="283.92" y="373.88" width="55.1" height="15.88"/>
        <rect className="cls-12" x="283.92" y="389.76" width="55.1" height="15.88"/>
        <rect className="cls-12" x="283.92" y="405.65" width="55.1" height="15.88"/>
        <rect className="cls-13" x="256.51" y="284.71" width="27.4" height="9.76"/>
        <rect className="cls-13" x="283.92" y="284.71" width="55.1" height="9.76"/>
        <rect className="cls-12" x="339.02" y="294.47" width="27.47" height="15.88"/>
        <rect className="cls-12" x="339.02" y="310.35" width="27.47" height="15.88"/>
        <rect className="cls-12" x="339.02" y="326.24" width="27.47" height="15.88"/>
        <rect className="cls-12" x="339.02" y="342.12" width="27.47" height="15.88"/>
        <rect className="cls-12" x="339.02" y="358" width="27.47" height="15.88"/>
        <rect className="cls-12" x="339.02" y="373.88" width="27.47" height="15.88"/>
        <rect className="cls-12" x="339.02" y="389.76" width="27.47" height="15.88"/>
        <rect className="cls-12" x="339.02" y="405.65" width="27.47" height="15.88"/>
        <rect className="cls-12" x="366.48" y="294.47" width="55.04" height="15.88"/>
        <rect className="cls-12" x="366.48" y="310.35" width="55.04" height="15.88"/>
        <rect className="cls-12" x="366.48" y="326.24" width="55.04" height="15.88"/>
        <rect className="cls-12" x="366.48" y="342.12" width="55.04" height="15.88"/>
        <rect className="cls-12" x="366.48" y="358" width="55.04" height="15.88"/>
        <rect className="cls-12" x="366.48" y="373.88" width="55.04" height="15.88"/>
        <rect className="cls-12" x="366.48" y="389.76" width="55.04" height="15.88"/>
        <rect className="cls-12" x="366.48" y="405.65" width="55.04" height="15.88"/>
        <rect className="cls-13" x="339.02" y="284.71" width="27.47" height="9.76"/>
        <rect className="cls-13" x="366.48" y="284.71" width="55.04" height="9.76"/>
        <rect className="cls-12" x="421.52" y="294.47" width="27.53" height="15.88"/>
        <rect className="cls-12" x="421.52" y="310.35" width="27.53" height="15.88"/>
        <rect className="cls-12" x="421.52" y="326.24" width="27.53" height="15.88"/>
        <rect className="cls-12" x="421.52" y="342.12" width="27.53" height="15.88"/>
        <rect className="cls-12" x="421.52" y="358" width="27.53" height="15.88"/>
        <rect className="cls-12" x="421.52" y="373.88" width="27.53" height="15.88"/>
        <rect className="cls-12" x="421.52" y="389.76" width="27.53" height="15.88"/>
        <rect className="cls-12" x="421.52" y="405.65" width="27.53" height="15.88"/>
        <rect className="cls-12" x="449.05" y="294.47" width="54.97" height="15.88"/>
        <rect className="cls-12" x="449.05" y="310.35" width="54.97" height="15.88"/>
        <rect className="cls-12" x="449.05" y="326.24" width="54.97" height="15.88"/>
        <rect className="cls-12" x="449.05" y="342.12" width="54.97" height="15.88"/>
        <rect className="cls-12" x="449.05" y="358" width="54.97" height="15.88"/>
        <rect className="cls-12" x="449.05" y="373.88" width="54.97" height="15.88"/>
        <rect className="cls-12" x="449.05" y="389.76" width="54.97" height="15.88"/>
        <rect className="cls-12" x="449.05" y="405.65" width="54.97" height="15.88"/>
        <rect className="cls-13" x="421.52" y="284.71" width="27.53" height="9.76"/>
        <rect className="cls-13" x="449.05" y="284.71" width="54.97" height="9.76"/>
        <rect className="cls-12" x="504.03" y="294.47" width="27.53" height="15.88"/>
        <rect className="cls-12" x="504.03" y="310.35" width="27.53" height="15.88"/>
        <rect className="cls-12" x="504.03" y="326.24" width="27.53" height="15.88"/>
        <rect className="cls-12" x="504.03" y="342.12" width="27.53" height="15.88"/>
        <rect className="cls-12" x="504.03" y="358" width="27.53" height="15.88"/>
        <rect className="cls-12" x="504.03" y="373.88" width="27.53" height="15.88"/>
        <rect className="cls-12" x="504.03" y="389.76" width="27.53" height="15.88"/>
        <rect className="cls-12" x="504.03" y="405.65" width="27.53" height="15.88"/>
        <rect className="cls-12" x="531.55" y="294.47" width="54.97" height="15.88"/>
        <rect className="cls-12" x="531.55" y="310.35" width="54.97" height="15.88"/>
        <rect className="cls-12" x="531.55" y="326.24" width="54.97" height="15.88"/>
        <rect className="cls-12" x="531.55" y="342.12" width="54.97" height="15.88"/>
        <rect className="cls-12" x="531.55" y="358" width="54.97" height="15.88"/>
        <rect className="cls-12" x="531.55" y="373.88" width="54.97" height="15.88"/>
        <rect className="cls-12" x="531.55" y="389.76" width="54.97" height="15.88"/>
        <rect className="cls-12" x="531.55" y="405.65" width="54.97" height="15.88"/>
        <rect className="cls-13" x="504.03" y="284.71" width="27.53" height="9.76"/>
        <rect className="cls-13" x="531.55" y="284.71" width="54.97" height="9.76"/>
        <rect className="cls-14" x="256.51" y="273.18" width="82.5" height="148.35"/>
        <rect className="cls-14" x="504.03" y="273.18" width="82.5" height="148.35"/>
        <rect className="cls-13" x="91.5" y="273.18" width="82.5" height="11.53"/>
        <rect className="cls-13" x="174.01" y="273.18" width="82.5" height="11.53"/>
        <rect className="cls-13" x="256.51" y="273.18" width="82.5" height="11.53"/>
        <rect className="cls-13" x="339.02" y="273.18" width="82.5" height="11.53"/>
        <rect className="cls-13" x="421.52" y="273.18" width="82.5" height="11.53"/>
        <rect className="cls-13" x="504.03" y="273.18" width="82.5" height="11.53"/>
        <rect className="cls-12" x="9" y="454.35" width="27.53" height="15.88"/>
        <rect className="cls-12" x="9" y="470.24" width="27.53" height="15.88"/>
        <rect className="cls-12" x="9" y="486.12" width="27.53" height="15.88"/>
        <rect className="cls-12" x="9" y="502" width="27.53" height="15.88"/>
        <rect className="cls-12" x="9" y="517.88" width="27.53" height="15.88"/>
        <rect className="cls-12" x="9" y="533.76" width="27.53" height="15.88"/>
        <rect className="cls-12" x="9" y="549.65" width="27.53" height="15.88"/>
        <rect className="cls-12" x="36.53" y="454.35" width="54.97" height="15.88"/>
        <rect className="cls-12" x="36.53" y="470.24" width="54.97" height="15.88"/>
        <rect className="cls-12" x="36.53" y="486.12" width="54.97" height="15.88"/>
        <rect className="cls-12" x="36.53" y="502" width="54.97" height="15.88"/>
        <rect className="cls-12" x="36.53" y="517.88" width="54.97" height="15.88"/>
        <rect className="cls-12" x="36.53" y="533.76" width="54.97" height="15.88"/>
        <rect className="cls-12" x="36.53" y="549.65" width="54.97" height="15.88"/>
        <rect className="cls-13" x="9" y="444.59" width="27.53" height="9.76"/>
        <rect className="cls-13" x="36.53" y="444.59" width="54.97" height="9.76"/>
        <rect className="cls-12" x="91.5" y="454.35" width="27.53" height="15.88"/>
        <rect className="cls-12" x="91.5" y="470.24" width="27.53" height="15.88"/>
        <rect className="cls-12" x="91.5" y="486.12" width="27.53" height="15.88"/>
        <rect className="cls-12" x="91.5" y="502" width="27.53" height="15.88"/>
        <rect className="cls-12" x="91.5" y="517.88" width="27.53" height="15.88"/>
        <rect className="cls-12" x="91.5" y="533.76" width="27.53" height="15.88"/>
        <rect className="cls-12" x="91.5" y="549.65" width="27.53" height="15.88"/>
        <rect className="cls-12" x="119.03" y="454.35" width="54.97" height="15.88"/>
        <rect className="cls-12" x="119.03" y="470.24" width="54.97" height="15.88"/>
        <rect className="cls-12" x="119.03" y="486.12" width="54.97" height="15.88"/>
        <rect className="cls-12" x="119.03" y="502" width="54.97" height="15.88"/>
        <rect className="cls-12" x="119.03" y="517.88" width="54.97" height="15.88"/>
        <rect className="cls-12" x="119.03" y="533.76" width="54.97" height="15.88"/>
        <rect className="cls-12" x="119.03" y="549.65" width="54.97" height="15.88"/>
        <rect className="cls-13" x="91.5" y="444.59" width="27.53" height="9.76"/>
        <rect className="cls-13" x="119.03" y="444.59" width="54.97" height="9.76"/>
        <rect className="cls-12" x="174.01" y="454.35" width="27.53" height="15.88"/>
        <rect className="cls-12" x="174.01" y="470.24" width="27.53" height="15.88"/>
        <rect className="cls-12" x="174.01" y="486.12" width="27.53" height="15.88"/>
        <rect className="cls-12" x="174.01" y="502" width="27.53" height="15.88"/>
        <rect className="cls-12" x="174.01" y="517.88" width="27.53" height="15.88"/>
        <rect className="cls-12" x="174.01" y="533.76" width="27.53" height="15.88"/>
        <rect className="cls-12" x="174.01" y="549.65" width="27.53" height="15.88"/>
        <rect className="cls-12" x="201.54" y="454.35" width="54.97" height="15.88"/>
        <rect className="cls-12" x="201.54" y="470.24" width="54.97" height="15.88"/>
        <rect className="cls-12" x="201.54" y="486.12" width="54.97" height="15.88"/>
        <rect className="cls-12" x="201.54" y="502" width="54.97" height="15.88"/>
        <rect className="cls-12" x="201.54" y="517.88" width="54.97" height="15.88"/>
        <rect className="cls-12" x="201.54" y="533.76" width="54.97" height="15.88"/>
        <rect className="cls-12" x="201.54" y="549.65" width="54.97" height="15.88"/>
        <rect className="cls-13" x="174.01" y="444.59" width="27.53" height="9.76"/>
        <rect className="cls-13" x="201.54" y="444.59" width="54.97" height="9.76"/>
        <rect className="cls-13" x="9" y="421.53" width="247.51" height="11.53"/>
        <rect className="cls-13" x="256.51" y="421.53" width="330.02" height="11.53"/>
        <rect className="cls-13" x="9" y="433.06" width="82.5" height="11.53"/>
        <rect className="cls-13" x="9" y="565.53" width="165.01" height="7.65"/>
        <rect className="cls-13" x="174.01" y="565.53" width="109.91" height="7.65"/>
        <rect className="cls-13" x="283.92" y="565.53" width="109.85" height="7.65"/>
        <rect className="cls-13" x="393.76" y="565.53" width="82.77" height="7.65"/>
        <rect className="cls-13" x="476.54" y="565.53" width="109.99" height="7.65"/>
        <rect className="cls-13" x="476.54" y="573.18" width="55" height="7.65"/>
        <rect className="cls-13" x="531.53" y="573.18" width="27.51" height="7.65"/>
        <rect className="cls-13" x="559.04" y="573.18" width="27.49" height="7.65"/>
        <rect className="cls-13" x="393.76" y="573.18" width="55.29" height="7.65"/>
        <rect className="cls-13" x="393.76" y="623.18" width="82.78" height="8.47"/>
        <rect className="cls-13" x="476.54" y="614.71" width="109.99" height="8.47"/>
        <rect className="cls-13" x="476.54" y="623.18" width="55" height="8.47"/>
        <rect className="cls-13" x="531.53" y="623.18" width="27.49" height="8.47"/>
        <rect className="cls-13" x="559.02" y="623.18" width="27.51" height="8.47"/>
        <rect className="cls-13" x="449.05" y="573.18" width="27.49" height="7.65"/>
        <rect className="cls-13" x="283.92" y="573.18" width="109.85" height="7.65"/>
        <rect className="cls-13" x="174.01" y="606.24" width="54.94" height="8.47"/>
        <rect className="cls-13" x="228.95" y="606.24" width="54.97" height="8.47"/>
        <rect className="cls-13" x="174.01" y="631.65" width="54.97" height="8.47"/>
        <rect className="cls-13" x="229" y="631.65" width="27.44" height="8.47"/>
        <rect className="cls-13" x="256.43" y="631.65" width="27.49" height="8.47"/>
        <rect className="cls-13" x="174.01" y="573.18" width="54.94" height="7.65"/>
        <rect className="cls-13" x="228.95" y="573.18" width="54.97" height="7.65"/>
        <rect className="cls-13" x="9" y="573.18" width="55" height="7.65"/>
        <rect className="cls-13" x="9" y="623.18" width="55" height="8.47"/>
        <rect className="cls-13" x="9.02" y="657.06" width="137.48" height="8.47"/>
        <rect className="cls-13" x="146.5" y="657.06" width="109.93" height="8.47"/>
        <rect className="cls-13" x="326.03" y="665.53" width="31.83" height="8.47"/>
        <rect className="cls-13" x="357.8" y="665.53" width="31.83" height="8.47"/>
        <rect className="cls-13" x="389.63" y="665.53" width="31.83" height="8.47"/>
        <rect className="cls-13" x="491" y="665.53" width="31.83" height="8.47"/>
        <rect className="cls-13" x="522.83" y="665.53" width="31.83" height="8.47"/>
        <rect className="cls-13" x="554.65" y="665.53" width="31.88" height="8.47"/>
        <rect className="cls-13" x="256.48" y="665.53" width="69.55" height="8.47"/>
        <rect className="cls-13" x="256.48" y="657.06" width="164.89" height="8.47"/>
        <rect className="cls-13" x="325.95" y="775.61" width="31.83" height="8.47"/>
        <rect className="cls-13" x="357.78" y="775.61" width="31.83" height="8.47"/>
        <rect className="cls-13" x="389.61" y="775.61" width="31.83" height="8.47"/>
        <rect className="cls-13" x="256.48" y="775.65" width="69.55" height="8.47"/>
        <rect className="cls-13" x="256.48" y="767.18" width="164.89" height="8.47"/>
        <rect className="cls-13" x="421.46" y="657.06" width="165.07" height="8.47"/>
        <rect className="cls-13" x="421.46" y="665.53" width="69.55" height="8.47"/>
        <rect className="cls-13" x="146.5" y="674" width="109.93" height="8.47"/>
        <rect className="cls-13" x="146.56" y="741.76" width="109.93" height="8.47"/>
        <rect className="cls-13" x="146.56" y="784.12" width="109.93" height="8.47"/>
        <rect className="cls-13" x="146.53" y="665.53" width="54.92" height="8.47"/>
        <rect className="cls-13" x="201.45" y="665.53" width="54.99" height="8.47"/>
        <rect className="cls-13" x="9.02" y="665.53" width="54.97" height="8.47"/>
        <rect className="cls-13" x="9.02" y="674" width="54.97" height="8.47"/>
        <rect className="cls-13" x="64" y="665.53" width="55.02" height="8.47"/>
        <rect className="cls-13" x="8.95" y="758.71" width="137.59" height="8.47"/>
        <rect className="cls-13" x="8.95" y="801.06" width="137.59" height="8.47"/>
        <rect className="cls-13" x="64" y="674" width="27.49" height="8.47"/>
        <rect className="cls-13" x="119.02" y="665.53" width="27.49" height="8.47"/>
        <rect className="cls-13" x="91.48" y="674" width="55.04" height="8.47"/>
        <rect className="cls-13" x="64" y="623.18" width="55.04" height="8.47"/>
        <rect className="cls-13" x="119.03" y="623.18" width="54.97" height="8.47"/>
        <rect className="cls-12" x="9.02" y="580.82" width="54.97" height="8.47"/>
        <rect className="cls-12" x="9.02" y="589.29" width="54.97" height="8.47"/>
        <rect className="cls-12" x="9.02" y="597.76" width="54.97" height="8.47"/>
        <rect className="cls-12" x="9.02" y="631.65" width="54.97" height="8.47"/>
        <rect className="cls-12" x="9.02" y="640.12" width="54.97" height="8.47"/>
        <rect className="cls-12" x="9.02" y="648.59" width="54.97" height="8.47"/>
        <rect className="cls-12" x="9" y="682.47" width="55" height="8.47"/>
        <rect className="cls-12" x="9" y="690.94" width="55" height="8.47"/>
        <rect className="cls-12" x="9" y="699.41" width="55" height="8.47"/>
        <rect className="cls-12" x="9" y="707.88" width="55" height="8.47"/>
        <rect className="cls-12" x="9" y="716.35" width="55" height="8.47"/>
        <rect className="cls-12" x="9" y="724.82" width="55" height="8.47"/>
        <rect className="cls-12" x="9" y="733.29" width="55" height="8.47"/>
        <rect className="cls-12" x="9" y="741.76" width="55" height="8.47"/>
        <rect className="cls-12" x="9" y="750.24" width="55" height="8.47"/>
        <rect className="cls-12" x="9" y="758.71" width="137.51" height="8.47"/>
        <rect className="cls-12" x="9" y="767.18" width="137.51" height="8.47"/>
        <rect className="cls-12" x="9" y="775.65" width="137.51" height="8.47"/>
        <rect className="cls-12" x="9" y="784.12" width="137.51" height="8.47"/>
        <rect className="cls-12" x="9" y="792.59" width="137.51" height="8.47"/>
        <rect className="cls-12" x="9" y="809.53" width="137.51" height="8.47"/>
        <rect className="cls-12" x="9" y="818" width="137.51" height="8.47"/>
        <rect className="cls-12" x="64" y="818" width="82.56" height="8.47"/>
        <rect className="cls-12" x="64" y="809.53" width="82.56" height="8.47"/>
        <rect className="cls-12" x="64" y="826.47" width="82.56" height="8.47"/>
        <rect className="cls-12" x="9" y="826.47" width="137.51" height="8.47"/>
        <rect className="cls-12" x="64" y="682.47" width="27.49" height="8.47"/>
        <rect className="cls-12" x="64" y="690.94" width="27.48" height="8.47"/>
        <rect className="cls-12" x="64" y="699.41" width="27.48" height="8.47"/>
        <rect className="cls-12" x="64" y="707.88" width="27.48" height="8.47"/>
        <rect className="cls-12" x="64" y="716.35" width="27.48" height="8.47"/>
        <rect className="cls-12" x="64" y="724.82" width="27.48" height="8.47"/>
        <rect className="cls-12" x="64" y="733.29" width="27.48" height="8.47"/>
        <rect className="cls-12" x="64" y="741.76" width="27.48" height="8.47"/>
        <rect className="cls-12" x="64" y="750.24" width="27.48" height="8.47"/>
        <rect className="cls-12" x="91.48" y="682.47" width="55.04" height="8.47"/>
        <rect className="cls-12" x="91.48" y="690.94" width="55.04" height="8.47"/>
        <rect className="cls-12" x="146.51" y="682.47" width="54.98" height="8.47"/>
        <rect className="cls-12" x="201.5" y="682.47" width="54.98" height="8.47"/>
        <rect className="cls-12" x="146.51" y="690.94" width="54.98" height="8.47"/>
        <rect className="cls-12" x="201.49" y="690.94" width="54.98" height="8.47"/>
        <rect className="cls-12" x="421.46" y="674" width="69.55" height="8.47"/>
        <rect className="cls-12" x="491" y="674" width="31.83" height="8.47"/>
        <rect className="cls-12" x="522.83" y="674.02" width="31.83" height="8.47"/>
        <rect className="cls-12" x="554.65" y="673.99" width="31.85" height="8.45"/>
        <rect className="cls-12" x="421.46" y="682.49" width="69.55" height="8.47"/>
        <rect className="cls-12" x="491" y="682.47" width="31.83" height="8.47"/>
        <rect className="cls-12" x="522.83" y="682.49" width="31.83" height="8.47"/>
        <rect className="cls-12" x="554.65" y="682.48" width="31.85" height="8.45"/>
        <rect className="cls-12" x="421.46" y="690.94" width="69.55" height="8.47"/>
        <rect className="cls-12" x="491" y="690.94" width="31.83" height="8.47"/>
        <rect className="cls-12" x="522.83" y="690.96" width="31.83" height="8.47"/>
        <rect className="cls-12" x="554.65" y="690.95" width="31.85" height="8.45"/>
        <rect className="cls-12" x="256.48" y="674.01" width="69.55" height="8.47"/>
        <rect className="cls-12" x="326.03" y="674" width="31.83" height="8.47"/>
        <rect className="cls-12" x="357.8" y="674.01" width="31.83" height="8.47"/>
        <rect className="cls-12" x="389.63" y="674" width="31.75" height="8.45"/>
        <rect className="cls-12" x="256.48" y="682.47" width="69.55" height="8.47"/>
        <rect className="cls-12" x="326.03" y="682.47" width="31.83" height="8.47"/>
        <rect className="cls-12" x="357.8" y="682.47" width="31.83" height="8.47"/>
        <rect className="cls-12" x="389.63" y="682.48" width="31.75" height="8.45"/>
        <rect className="cls-12" x="256.48" y="690.94" width="69.55" height="8.47"/>
        <rect className="cls-12" x="326.03" y="690.94" width="31.83" height="8.47"/>
        <rect className="cls-12" x="357.8" y="690.94" width="31.83" height="8.47"/>
        <rect className="cls-12" x="389.63" y="690.95" width="31.75" height="8.45"/>
        <rect className="cls-12" x="256.48" y="699.41" width="69.55" height="8.47"/>
        <rect className="cls-12" x="326.03" y="699.41" width="31.83" height="8.47"/>
        <rect className="cls-12" x="357.8" y="699.41" width="31.83" height="8.47"/>
        <rect className="cls-12" x="389.63" y="699.42" width="31.75" height="8.45"/>
        <rect className="cls-12" x="256.48" y="707.88" width="69.55" height="8.47"/>
        <rect className="cls-12" x="326.03" y="707.88" width="31.83" height="8.47"/>
        <rect className="cls-12" x="357.8" y="707.88" width="31.83" height="8.47"/>
        <rect className="cls-12" x="389.63" y="707.89" width="31.75" height="8.45"/>
        <rect className="cls-12" x="256.48" y="716.35" width="69.55" height="8.47"/>
        <rect className="cls-12" x="326.03" y="716.35" width="31.83" height="8.47"/>
        <rect className="cls-12" x="357.8" y="716.35" width="31.83" height="8.47"/>
        <rect className="cls-12" x="389.63" y="716.36" width="31.75" height="8.45"/>
        <rect className="cls-12" x="256.48" y="724.82" width="69.55" height="8.47"/>
        <rect className="cls-12" x="326.03" y="724.82" width="31.83" height="8.47"/>
        <rect className="cls-12" x="357.8" y="724.82" width="31.83" height="8.47"/>
        <rect className="cls-12" x="389.63" y="724.83" width="31.75" height="8.45"/>
        <rect className="cls-12" x="256.48" y="733.29" width="69.55" height="8.47"/>
        <rect className="cls-12" x="326.03" y="733.29" width="31.83" height="8.47"/>
        <rect className="cls-12" x="357.8" y="733.29" width="31.83" height="8.47"/>
        <rect className="cls-12" x="389.61" y="733.31" width="31.75" height="8.45"/>
        <rect className="cls-12" x="256.48" y="741.76" width="69.55" height="8.47"/>
        <rect className="cls-12" x="326.03" y="741.76" width="31.83" height="8.47"/>
        <rect className="cls-12" x="357.8" y="741.76" width="31.83" height="8.47"/>
        <rect className="cls-12" x="389.61" y="741.78" width="31.75" height="8.45"/>
        <rect className="cls-12" x="256.48" y="750.24" width="69.55" height="8.47"/>
        <rect className="cls-12" x="326.03" y="750.24" width="31.83" height="8.47"/>
        <rect className="cls-12" x="357.8" y="750.24" width="31.83" height="8.47"/>
        <rect className="cls-12" x="389.61" y="750.25" width="31.75" height="8.45"/>
        <rect className="cls-12" x="256.44" y="784.12" width="69.55" height="8.47"/>
        <rect className="cls-12" x="325.98" y="784.12" width="31.78" height="8.47"/>
        <rect className="cls-12" x="357.76" y="784.12" width="31.83" height="8.47"/>
        <rect className="cls-12" x="389.57" y="784.13" width="31.85" height="8.45"/>
        <rect className="cls-12" x="256.44" y="792.59" width="69.55" height="8.47"/>
        <rect className="cls-12" x="325.98" y="792.59" width="31.78" height="8.47"/>
        <rect className="cls-12" x="357.76" y="792.59" width="31.83" height="8.47"/>
        <rect className="cls-12" x="389.57" y="792.6" width="31.85" height="8.45"/>
        <rect className="cls-12" x="256.44" y="801.06" width="69.55" height="8.47"/>
        <rect className="cls-12" x="325.98" y="801.06" width="31.78" height="8.47"/>
        <rect className="cls-12" x="357.76" y="801.06" width="31.83" height="8.47"/>
        <rect className="cls-12" x="389.57" y="801.07" width="31.85" height="8.45"/>
        <rect className="cls-12" x="256.44" y="809.53" width="69.55" height="8.47"/>
        <rect className="cls-12" x="325.98" y="809.53" width="31.78" height="8.47"/>
        <rect className="cls-12" x="357.76" y="809.53" width="31.83" height="8.47"/>
        <rect className="cls-12" x="389.57" y="809.54" width="31.85" height="8.45"/>
        <rect className="cls-12" x="256.44" y="818" width="69.55" height="8.47"/>
        <rect className="cls-12" x="325.98" y="818" width="31.78" height="8.47"/>
        <rect className="cls-12" x="357.76" y="818" width="31.83" height="8.47"/>
        <rect className="cls-12" x="389.57" y="818.01" width="31.85" height="8.45"/>
        <rect className="cls-12" x="256.48" y="758.71" width="69.55" height="8.47"/>
        <rect className="cls-12" x="326.03" y="758.71" width="31.83" height="8.47"/>
        <rect className="cls-12" x="357.84" y="758.71" width="31.83" height="8.47"/>
        <rect className="cls-12" x="389.61" y="758.72" width="31.75" height="8.45"/>
        <rect className="cls-12" x="421.46" y="699.41" width="69.55" height="8.47"/>
        <rect className="cls-12" x="491" y="699.41" width="31.83" height="8.47"/>
        <rect className="cls-12" x="522.83" y="699.43" width="31.83" height="8.47"/>
        <rect className="cls-12" x="554.65" y="699.42" width="31.85" height="8.45"/>
        <rect className="cls-12" x="421.46" y="707.88" width="69.55" height="8.47"/>
        <rect className="cls-12" x="491" y="707.88" width="31.83" height="8.47"/>
        <rect className="cls-12" x="522.83" y="707.9" width="31.83" height="8.47"/>
        <rect className="cls-12" x="554.65" y="707.9" width="31.85" height="8.45"/>
        <rect className="cls-12" x="421.46" y="716.35" width="69.55" height="8.47"/>
        <rect className="cls-12" x="491" y="716.35" width="31.83" height="8.47"/>
        <rect className="cls-12" x="522.83" y="716.37" width="31.83" height="8.47"/>
        <rect className="cls-12" x="554.65" y="716.37" width="31.85" height="8.45"/>
        <rect className="cls-12" x="421.46" y="724.82" width="69.55" height="8.47"/>
        <rect className="cls-12" x="491" y="724.82" width="31.83" height="8.47"/>
        <rect className="cls-12" x="522.83" y="724.84" width="31.83" height="8.47"/>
        <rect className="cls-12" x="554.65" y="724.84" width="31.85" height="8.45"/>
        <rect className="cls-12" x="421.46" y="733.29" width="69.55" height="8.47"/>
        <rect className="cls-12" x="491" y="733.29" width="31.83" height="8.47"/>
        <rect className="cls-12" x="522.83" y="733.31" width="31.83" height="8.47"/>
        <rect className="cls-12" x="554.65" y="733.31" width="31.85" height="8.45"/>
        <rect className="cls-12" x="421.46" y="741.76" width="69.55" height="8.47"/>
        <rect className="cls-12" x="491" y="741.76" width="31.83" height="8.47"/>
        <rect className="cls-12" x="522.83" y="741.79" width="31.83" height="8.47"/>
        <rect className="cls-12" x="554.65" y="741.78" width="31.85" height="8.45"/>
        <rect className="cls-12" x="421.46" y="750.24" width="69.55" height="8.47"/>
        <rect className="cls-12" x="491" y="750.24" width="31.83" height="8.47"/>
        <rect className="cls-12" x="522.83" y="750.26" width="31.83" height="8.47"/>
        <rect className="cls-12" x="554.65" y="750.25" width="31.85" height="8.45"/>
        <rect className="cls-12" x="421.46" y="758.71" width="69.55" height="8.47"/>
        <rect className="cls-12" x="491" y="758.71" width="31.83" height="8.47"/>
        <rect className="cls-12" x="522.83" y="758.73" width="31.83" height="8.47"/>
        <rect className="cls-12" x="554.65" y="758.72" width="31.85" height="8.45"/>
        <rect className="cls-12" x="421.46" y="767.18" width="69.55" height="8.47"/>
        <rect className="cls-12" x="491" y="767.18" width="31.83" height="8.47"/>
        <rect className="cls-12" x="522.83" y="767.2" width="31.83" height="8.47"/>
        <rect className="cls-12" x="554.65" y="767.19" width="31.85" height="8.45"/>
        <rect className="cls-12" x="421.46" y="775.65" width="69.55" height="8.47"/>
        <rect className="cls-12" x="491" y="775.65" width="31.83" height="8.47"/>
        <rect className="cls-12" x="522.83" y="775.65" width="31.83" height="8.47"/>
        <rect className="cls-12" x="554.65" y="775.66" width="31.85" height="8.45"/>
        <rect className="cls-12" x="421.46" y="784.12" width="69.55" height="8.47"/>
        <rect className="cls-12" x="491" y="784.12" width="31.83" height="8.47"/>
        <rect className="cls-12" x="522.83" y="784.12" width="31.83" height="8.47"/>
        <rect className="cls-12" x="554.65" y="784.13" width="31.85" height="8.45"/>
        <rect className="cls-12" x="421.46" y="792.59" width="69.55" height="8.47"/>
        <rect className="cls-12" x="491" y="792.59" width="31.83" height="8.47"/>
        <rect className="cls-12" x="522.83" y="792.59" width="31.83" height="8.47"/>
        <rect className="cls-12" x="554.65" y="792.6" width="31.85" height="8.45"/>
        <rect className="cls-12" x="421.46" y="801.06" width="69.55" height="8.47"/>
        <rect className="cls-12" x="491" y="801.06" width="31.83" height="8.47"/>
        <rect className="cls-12" x="522.83" y="801.06" width="31.83" height="8.47"/>
        <rect className="cls-12" x="554.65" y="801.07" width="31.85" height="8.45"/>
        <rect className="cls-12" x="421.46" y="809.53" width="69.55" height="8.47"/>
        <rect className="cls-12" x="491" y="809.53" width="31.83" height="8.47"/>
        <rect className="cls-12" x="522.83" y="809.53" width="31.83" height="8.47"/>
        <rect className="cls-12" x="554.65" y="809.54" width="31.85" height="8.45"/>
        <rect className="cls-12" x="421.46" y="818" width="69.55" height="8.47"/>
        <rect className="cls-12" x="491" y="818" width="31.83" height="8.47"/>
        <rect className="cls-12" x="522.83" y="818" width="31.83" height="8.47"/>
        <rect className="cls-12" x="554.65" y="818.01" width="31.85" height="8.45"/>
        <rect className="cls-12" x="256.44" y="826.47" width="69.55" height="8.47"/>
        <rect className="cls-12" x="325.98" y="826.47" width="31.78" height="8.47"/>
        <rect className="cls-12" x="357.76" y="826.47" width="31.83" height="8.47"/>
        <rect className="cls-12" x="389.57" y="826.48" width="31.85" height="8.45"/>
        <rect className="cls-12" x="421.46" y="826.47" width="69.55" height="8.47"/>
        <rect className="cls-12" x="491" y="826.47" width="31.83" height="8.47"/>
        <rect className="cls-12" x="522.83" y="826.47" width="31.83" height="8.47"/>
        <rect className="cls-12" x="554.65" y="826.48" width="31.85" height="8.45"/>
        <rect className="cls-12" x="146.51" y="699.41" width="54.98" height="8.47"/>
        <rect className="cls-12" x="201.49" y="699.41" width="54.98" height="8.47"/>
        <rect className="cls-12" x="146.51" y="707.88" width="54.98" height="8.47"/>
        <rect className="cls-12" x="201.49" y="707.88" width="54.98" height="8.47"/>
        <rect className="cls-12" x="146.52" y="716.35" width="54.98" height="8.47"/>
        <rect className="cls-12" x="201.5" y="716.35" width="54.98" height="8.47"/>
        <rect className="cls-12" x="146.52" y="724.82" width="54.98" height="8.47"/>
        <rect className="cls-12" x="201.5" y="724.82" width="54.98" height="8.47"/>
        <rect className="cls-12" x="146.52" y="750.25" width="54.98" height="8.47"/>
        <rect className="cls-12" x="201.5" y="750.25" width="54.98" height="8.47"/>
        <rect className="cls-12" x="146.52" y="758.71" width="54.98" height="8.47"/>
        <rect className="cls-12" x="201.5" y="758.71" width="54.98" height="8.47"/>
        <rect className="cls-12" x="146.52" y="767.17" width="54.98" height="8.47"/>
        <rect className="cls-12" x="146.52" y="792.59" width="54.98" height="8.47"/>
        <rect className="cls-12" x="201.5" y="792.59" width="54.98" height="8.47"/>
        <rect className="cls-12" x="146.52" y="801.06" width="54.98" height="8.47"/>
        <rect className="cls-12" x="201.5" y="801.06" width="54.98" height="8.47"/>
        <rect className="cls-12" x="146.52" y="809.53" width="54.98" height="8.47"/>
        <rect className="cls-12" x="201.5" y="809.53" width="54.98" height="8.47"/>
        <rect className="cls-12" x="146.52" y="818" width="54.98" height="8.47"/>
        <rect className="cls-12" x="201.5" y="818" width="54.98" height="8.47"/>
        <rect className="cls-12" x="146.52" y="826.47" width="54.98" height="8.47"/>
        <rect className="cls-12" x="201.5" y="826.47" width="54.98" height="8.47"/>
        <rect className="cls-12" x="201.5" y="767.17" width="54.98" height="8.47"/>
        <rect className="cls-12" x="146.52" y="775.63" width="54.98" height="8.47"/>
        <rect className="cls-12" x="201.5" y="775.63" width="54.98" height="8.47"/>
        <rect className="cls-12" x="146.52" y="733.29" width="54.98" height="8.47"/>
        <rect className="cls-12" x="201.5" y="733.29" width="54.98" height="8.47"/>
        <rect className="cls-12" x="91.48" y="699.41" width="55.04" height="8.47"/>
        <rect className="cls-12" x="91.48" y="707.88" width="55.04" height="8.47"/>
        <rect className="cls-12" x="91.48" y="716.35" width="55.04" height="8.47"/>
        <rect className="cls-12" x="91.48" y="724.82" width="55.04" height="8.47"/>
        <rect className="cls-12" x="91.48" y="733.29" width="55.04" height="8.47"/>
        <rect className="cls-12" x="91.48" y="741.76" width="55.04" height="8.47"/>
        <rect className="cls-12" x="91.48" y="750.24" width="55.04" height="8.47"/>
        <rect className="cls-12" x="63.99" y="631.65" width="55.05" height="8.47"/>
        <rect className="cls-12" x="63.99" y="640.12" width="55.05" height="8.47"/>
        <rect className="cls-12" x="63.99" y="648.59" width="55.05" height="8.47"/>
        <rect className="cls-12" x="119.03" y="631.65" width="55" height="8.47"/>
        <rect className="cls-12" x="119.03" y="640.12" width="55" height="8.47"/>
        <rect className="cls-12" x="119.03" y="648.59" width="55" height="8.47"/>
        <rect className="cls-12" x="9.02" y="606.24" width="54.97" height="8.47"/>
        <rect className="cls-12" x="9.02" y="614.71" width="54.97" height="8.47"/>
        <rect className="cls-14" x="8.98" y="573.18" width="165.02" height="50"/>
        <rect className="cls-14" x="9.02" y="631.65" width="54.97" height="25.41"/>
        <rect className="cls-14" x="63.99" y="631.65" width="55.05" height="25.41"/>
        <rect className="cls-14" x="8.98" y="682.47" width="137.54" height="76.24"/>
        <rect className="cls-14" x="119.03" y="623.18" width="55" height="33.88"/>
        <rect className="cls-14" x="283.9" y="580.82" width="109.86" height="76.24"/>
        <rect className="cls-12" x="64" y="580.82" width="27.52" height="8.47"/>
        <rect className="cls-12" x="64" y="589.29" width="27.52" height="8.47"/>
        <rect className="cls-12" x="64" y="597.76" width="27.52" height="8.47"/>
        <rect className="cls-12" x="64" y="606.24" width="27.52" height="8.47"/>
        <rect className="cls-12" x="64" y="614.71" width="27.52" height="8.47"/>
        <rect className="cls-12" x="91.51" y="580.82" width="82.5" height="8.47"/>
        <rect className="cls-12" x="91.51" y="589.29" width="82.5" height="8.47"/>
        <rect className="cls-12" x="174.01" y="580.82" width="54.94" height="8.47"/>
        <rect className="cls-12" x="174.01" y="589.29" width="54.94" height="8.47"/>
        <rect className="cls-12" x="174.01" y="597.76" width="54.94" height="8.47"/>
        <rect className="cls-12" x="174.01" y="614.71" width="54.94" height="8.47"/>
        <rect className="cls-12" x="174.01" y="623.18" width="54.94" height="8.47"/>
        <rect className="cls-12" x="174.01" y="640.12" width="54.94" height="8.47"/>
        <rect className="cls-12" x="174.01" y="648.59" width="54.94" height="8.47"/>
        <rect className="cls-12" x="228.95" y="640.12" width="54.97" height="8.47"/>
        <rect className="cls-12" x="228.95" y="648.59" width="54.97" height="8.47"/>
        <rect className="cls-12" x="228.95" y="614.71" width="54.97" height="8.47"/>
        <rect className="cls-12" x="228.95" y="623.18" width="54.97" height="8.47"/>
        <rect className="cls-12" x="228.95" y="580.82" width="54.97" height="8.47"/>
        <rect className="cls-12" x="228.95" y="589.29" width="54.97" height="8.47"/>
        <rect className="cls-12" x="283.98" y="580.82" width="109.78" height="8.47"/>
        <rect className="cls-12" x="283.98" y="589.29" width="109.78" height="8.47"/>
        <rect className="cls-12" x="393.76" y="580.82" width="55.29" height="8.47"/>
        <rect className="cls-12" x="393.76" y="589.29" width="55.29" height="8.47"/>
        <rect className="cls-12" x="449.05" y="580.82" width="27.49" height="8.47"/>
        <rect className="cls-12" x="449.05" y="589.29" width="27.49" height="8.47"/>
        <rect className="cls-12" x="476.54" y="580.82" width="55" height="8.47"/>
        <rect className="cls-12" x="531.53" y="580.82" width="27.51" height="8.47"/>
        <rect className="cls-12" x="559.04" y="580.82" width="27.49" height="8.47"/>
        <rect className="cls-12" x="476.54" y="589.29" width="55" height="8.47"/>
        <rect className="cls-12" x="531.53" y="589.29" width="27.51" height="8.47"/>
        <rect className="cls-12" x="559.04" y="589.29" width="27.49" height="8.47"/>
        <rect className="cls-12" x="476.54" y="597.76" width="55" height="8.47"/>
        <rect className="cls-12" x="531.53" y="597.76" width="27.51" height="8.47"/>
        <rect className="cls-12" x="559.04" y="597.76" width="27.49" height="8.47"/>
        <rect className="cls-12" x="476.54" y="606.24" width="55" height="8.47"/>
        <rect className="cls-12" x="476.54" y="631.65" width="55" height="8.47"/>
        <rect className="cls-12" x="531.54" y="631.65" width="27.48" height="8.47"/>
        <rect className="cls-12" x="559.02" y="631.65" width="27.51" height="8.47"/>
        <rect className="cls-12" x="476.54" y="640.12" width="55.02" height="8.47"/>
        <rect className="cls-12" x="531.57" y="640.12" width="27.48" height="8.47"/>
        <rect className="cls-12" x="559.05" y="640.12" width="27.48" height="8.47"/>
        <rect className="cls-12" x="476.54" y="648.59" width="55.02" height="8.47"/>
        <rect className="cls-12" x="531.56" y="648.59" width="27.49" height="8.47"/>
        <rect className="cls-12" x="559.05" y="648.59" width="27.48" height="8.47"/>
        <rect className="cls-12" x="531.53" y="606.24" width="27.51" height="8.47"/>
        <rect className="cls-12" x="559.04" y="606.24" width="27.49" height="8.47"/>
        <rect className="cls-12" x="449.05" y="597.76" width="27.49" height="8.47"/>
        <rect className="cls-12" x="449.05" y="606.24" width="27.49" height="8.47"/>
        <rect className="cls-12" x="449.05" y="614.71" width="27.49" height="8.47"/>
        <rect className="cls-12" x="393.76" y="597.76" width="55.29" height="8.47"/>
        <rect className="cls-12" x="393.76" y="606.24" width="55.29" height="8.47"/>
        <rect className="cls-12" x="393.76" y="631.65" width="55.29" height="8.47"/>
        <rect className="cls-12" x="393.76" y="640.12" width="55.29" height="8.47"/>
        <rect className="cls-12" x="393.76" y="648.59" width="55.29" height="8.47"/>
        <rect className="cls-12" x="449.05" y="631.65" width="27.49" height="8.47"/>
        <rect className="cls-12" x="449.05" y="640.12" width="27.49" height="8.47"/>
        <rect className="cls-12" x="449.05" y="648.59" width="27.49" height="8.47"/>
        <rect className="cls-12" x="393.76" y="614.71" width="55.29" height="8.47"/>
        <rect className="cls-12" x="283.98" y="597.76" width="109.78" height="8.47"/>
        <rect className="cls-12" x="283.98" y="606.24" width="109.78" height="8.47"/>
        <rect className="cls-12" x="283.98" y="614.71" width="109.78" height="8.47"/>
        <rect className="cls-12" x="283.98" y="623.18" width="109.78" height="8.47"/>
        <rect className="cls-12" x="283.98" y="640.12" width="109.78" height="8.47"/>
        <rect className="cls-12" x="283.98" y="631.65" width="109.78" height="8.47"/>
        <rect className="cls-12" x="283.98" y="640.12" width="109.78" height="8.47"/>
        <rect className="cls-12" x="283.98" y="648.59" width="109.78" height="8.47"/>
        <rect className="cls-12" x="228.95" y="597.76" width="54.97" height="8.47"/>
        <rect className="cls-12" x="91.51" y="597.76" width="82.5" height="8.47"/>
        <rect className="cls-12" x="91.51" y="606.24" width="82.5" height="8.47"/>
        <rect className="cls-12" x="91.51" y="614.71" width="82.5" height="8.47"/>
        <rect className="cls-13" x="64" y="573.18" width="27.51" height="7.65"/>
        <rect className="cls-13" x="91.51" y="573.18" width="82.49" height="7.65"/>
        <rect className="cls-14" x="9" y="433.06" width="82.5" height="132.47"/>
        <rect className="cls-14" x="91.5" y="433.06" width="82.5" height="132.47"/>
        <rect className="cls-14" x="339.02" y="433.06" width="82.5" height="132.47"/>
        <rect className="cls-14" x="421.52" y="433.06" width="82.5" height="132.47"/>
        <rect className="cls-14" x="174.01" y="433.06" width="82.5" height="132.47"/>
        <rect className="cls-12" x="256.51" y="454.35" width="27.4" height="15.88"/>
        <rect className="cls-12" x="256.51" y="470.24" width="27.4" height="15.88"/>
        <rect className="cls-12" x="256.51" y="486.12" width="27.4" height="15.88"/>
        <rect className="cls-12" x="256.51" y="502" width="27.4" height="15.88"/>
        <rect className="cls-12" x="256.51" y="517.88" width="27.4" height="15.88"/>
        <rect className="cls-12" x="256.51" y="533.76" width="27.4" height="15.88"/>
        <rect className="cls-12" x="256.51" y="549.65" width="27.4" height="15.88"/>
        <rect className="cls-12" x="283.92" y="454.35" width="55.1" height="15.88"/>
        <rect className="cls-12" x="283.92" y="470.24" width="55.1" height="15.88"/>
        <rect className="cls-12" x="283.92" y="486.12" width="55.1" height="15.88"/>
        <rect className="cls-12" x="283.92" y="502" width="55.1" height="15.88"/>
        <rect className="cls-12" x="283.92" y="517.88" width="55.1" height="15.88"/>
        <rect className="cls-12" x="283.92" y="533.76" width="55.1" height="15.88"/>
        <rect className="cls-12" x="283.92" y="549.65" width="55.1" height="15.88"/>
        <rect className="cls-13" x="256.51" y="444.59" width="27.4" height="9.76"/>
        <rect className="cls-13" x="283.92" y="444.59" width="55.1" height="9.76"/>
        <rect className="cls-12" x="339.02" y="454.35" width="27.47" height="15.88"/>
        <rect className="cls-12" x="339.02" y="470.24" width="27.47" height="15.88"/>
        <rect className="cls-12" x="339.02" y="486.12" width="27.47" height="15.88"/>
        <rect className="cls-12" x="339.02" y="502" width="27.47" height="15.88"/>
        <rect className="cls-12" x="339.02" y="517.88" width="27.47" height="15.88"/>
        <rect className="cls-12" x="339.02" y="533.76" width="27.47" height="15.88"/>
        <rect className="cls-12" x="339.02" y="549.65" width="27.47" height="15.88"/>
        <rect className="cls-12" x="366.48" y="454.35" width="55.04" height="15.88"/>
        <rect className="cls-12" x="366.48" y="470.24" width="55.04" height="15.88"/>
        <rect className="cls-12" x="366.48" y="486.12" width="55.04" height="15.88"/>
        <rect className="cls-12" x="366.48" y="502" width="55.04" height="15.88"/>
        <rect className="cls-12" x="366.48" y="517.88" width="55.04" height="15.88"/>
        <rect className="cls-12" x="366.48" y="533.76" width="55.04" height="15.88"/>
        <rect className="cls-12" x="366.48" y="549.65" width="55.04" height="15.88"/>
        <rect className="cls-13" x="339.02" y="444.59" width="27.47" height="9.76"/>
        <rect className="cls-13" x="366.48" y="444.59" width="55.04" height="9.76"/>
        <rect className="cls-12" x="421.52" y="454.35" width="27.53" height="15.88"/>
        <rect className="cls-12" x="421.52" y="470.24" width="27.53" height="15.88"/>
        <rect className="cls-12" x="421.52" y="486.12" width="27.53" height="15.88"/>
        <rect className="cls-12" x="421.52" y="502" width="27.53" height="15.88"/>
        <rect className="cls-12" x="421.52" y="517.88" width="27.53" height="15.88"/>
        <rect className="cls-12" x="421.52" y="533.76" width="27.53" height="15.88"/>
        <rect className="cls-12" x="421.52" y="549.65" width="27.53" height="15.88"/>
        <rect className="cls-12" x="449.05" y="454.35" width="54.97" height="15.88"/>
        <rect className="cls-12" x="449.05" y="470.24" width="54.97" height="15.88"/>
        <rect className="cls-12" x="449.05" y="486.12" width="54.97" height="15.88"/>
        <rect className="cls-12" x="449.05" y="502" width="54.97" height="15.88"/>
        <rect className="cls-12" x="449.05" y="517.88" width="54.97" height="15.88"/>
        <rect className="cls-12" x="449.05" y="533.76" width="54.97" height="15.88"/>
        <rect className="cls-12" x="449.05" y="549.65" width="54.97" height="15.88"/>
        <rect className="cls-13" x="421.52" y="444.59" width="27.53" height="9.76"/>
        <rect className="cls-13" x="449.05" y="444.59" width="54.97" height="9.76"/>
        <rect className="cls-12" x="504.03" y="454.35" width="27.53" height="15.88"/>
        <rect className="cls-12" x="504.03" y="470.24" width="27.53" height="15.88"/>
        <rect className="cls-12" x="504.03" y="486.12" width="27.53" height="15.88"/>
        <rect className="cls-12" x="504.03" y="502" width="27.53" height="15.88"/>
        <rect className="cls-12" x="504.03" y="517.88" width="27.53" height="15.88"/>
        <rect className="cls-12" x="504.03" y="533.76" width="27.53" height="15.88"/>
        <rect className="cls-12" x="504.03" y="549.65" width="27.53" height="15.88"/>
        <rect className="cls-12" x="531.55" y="454.35" width="54.97" height="15.88"/>
        <rect className="cls-12" x="531.55" y="470.24" width="54.97" height="15.88"/>
        <rect className="cls-12" x="531.55" y="486.12" width="54.97" height="15.88"/>
        <rect className="cls-12" x="531.55" y="502" width="54.97" height="15.88"/>
        <rect className="cls-12" x="531.55" y="517.88" width="54.97" height="15.88"/>
        <rect className="cls-12" x="531.55" y="533.76" width="54.97" height="15.88"/>
        <rect className="cls-12" x="531.55" y="549.65" width="54.97" height="15.88"/>
        <rect className="cls-13" x="504.03" y="444.59" width="27.53" height="9.76"/>
        <rect className="cls-13" x="531.55" y="444.59" width="54.97" height="9.76"/>
        <rect className="cls-14" x="256.51" y="433.06" width="82.5" height="132.47"/>
        <rect className="cls-14" x="393.76" y="580.82" width="82.78" height="76.24"/>
        <rect className="cls-14" x="421.42" y="673.98" width="165.09" height="160.96"/>
        <rect className="cls-14" x="256.43" y="674.02" width="164.93" height="160.92"/>
        <rect className="cls-14" x="8.95" y="767.23" width="137.61" height="67.71"/>
        <rect className="cls-14" x="476.54" y="580.82" width="109.99" height="76.24"/>
        <rect className="cls-14" x="174.01" y="573.18" width="109.97" height="83.88"/>
        <rect className="cls-14" x="504.03" y="433.06" width="82.5" height="132.47"/>
        <rect className="cls-13" x="91.5" y="433.06" width="82.5" height="11.53"/>
        <rect className="cls-13" x="174.01" y="433.06" width="82.5" height="11.53"/>
        <rect className="cls-13" x="256.51" y="433.06" width="82.5" height="11.53"/>
        <rect className="cls-13" x="339.02" y="433.06" width="82.5" height="11.53"/>
        <rect className="cls-13" x="421.52" y="433.06" width="82.5" height="11.53"/>
        <rect className="cls-13" x="504.03" y="433.06" width="82.5" height="11.53"/>
        <rect className="cls-13" x="448.76" y="10.59" width="137.76" height="12.82"/>
        <rect className="cls-12" x="9" y="75.47" width="75.88" height="10.41"/>
        <rect className="cls-12" x="9" y="23.41" width="75.88" height="10.41"/>
        <rect className="cls-12" x="124.76" y="23.41" width="63.02" height="10.41"/>
        <rect className="cls-12" x="124.76" y="33.82" width="63.02" height="10.41"/>
        <rect className="cls-12" x="124.76" y="44.24" width="63.02" height="10.41"/>
        <rect className="cls-12" x="124.76" y="54.65" width="63.02" height="10.41"/>
        <rect className="cls-12" x="124.76" y="65.06" width="63.02" height="10.41"/>
        <rect className="cls-12" x="124.76" y="75.47" width="63.02" height="10.41"/>
        <rect className="cls-12" x="84.88" y="23.41" width="39.88" height="10.41"/>
        <rect className="cls-12" x="84.88" y="33.82" width="39.88" height="10.41"/>
        <rect className="cls-12" x="187.79" y="33.82" width="60.65" height="10.41"/>
        <rect className="cls-12" x="187.79" y="44.24" width="60.65" height="10.41"/>
        <rect className="cls-12" x="187.79" y="54.65" width="60.65" height="10.41"/>
        <rect className="cls-12" x="187.79" y="65.06" width="60.65" height="10.41"/>
        <rect className="cls-12" x="187.79" y="75.47" width="60.65" height="10.41"/>
        <rect className="cls-12" x="187.79" y="23.41" width="60.65" height="10.41"/>
        <rect className="cls-12" x="248.43" y="23.41" width="50.86" height="10.41"/>
        <rect className="cls-12" x="299.29" y="23.41" width="39.71" height="10.41"/>
        <rect className="cls-12" x="299.29" y="33.82" width="39.71" height="10.41"/>
        <rect className="cls-12" x="299.29" y="44.24" width="39.71" height="10.41"/>
        <rect className="cls-12" x="299.29" y="54.65" width="39.71" height="10.41"/>
        <rect className="cls-12" x="299.29" y="65.06" width="39.71" height="10.41"/>
        <rect className="cls-12" x="299.29" y="75.47" width="39.71" height="10.41"/>
        <rect className="cls-12" x="339" y="23.41" width="51" height="10.41"/>
        <rect className="cls-12" x="339" y="33.82" width="51" height="10.41"/>
        <rect className="cls-12" x="339" y="44.24" width="51" height="10.41"/>
        <rect className="cls-12" x="339" y="54.65" width="51" height="10.41"/>
        <rect className="cls-12" x="390" y="23.41" width="58.76" height="10.41"/>
        <rect className="cls-13" x="448.76" y="23.41" width="27.88" height="10.41"/>
        <rect className="cls-12" x="448.76" y="33.82" width="27.88" height="10.41"/>
        <rect className="cls-12" x="448.76" y="44.24" width="27.88" height="10.41"/>
        <rect className="cls-12" x="448.76" y="54.65" width="27.88" height="10.41"/>
        <rect className="cls-12" x="448.76" y="65.06" width="27.88" height="10.41"/>
        <rect className="cls-12" x="448.76" y="75.47" width="27.88" height="10.41"/>
        <rect className="cls-13" x="476.65" y="23.41" width="54.94" height="10.41"/>
        <rect className="cls-12" x="476.65" y="33.82" width="54.94" height="10.41"/>
        <rect className="cls-12" x="476.65" y="44.24" width="54.94" height="10.41"/>
        <rect className="cls-12" x="476.65" y="54.65" width="54.94" height="10.41"/>
        <rect className="cls-12" x="476.65" y="65.06" width="54.94" height="10.41"/>
        <rect className="cls-12" x="476.65" y="75.47" width="54.94" height="10.41"/>
        <rect className="cls-13" x="531.59" y="23.41" width="54.94" height="10.41"/>
        <rect className="cls-12" x="531.59" y="33.82" width="54.94" height="10.41"/>
        <rect className="cls-12" x="531.59" y="44.24" width="54.94" height="10.41"/>
        <rect className="cls-12" x="531.59" y="54.65" width="54.94" height="10.41"/>
        <rect className="cls-12" x="531.59" y="65.06" width="54.94" height="10.41"/>
        <rect className="cls-12" x="531.59" y="75.47" width="54.94" height="10.41"/>
        <rect className="cls-12" x="390" y="33.82" width="58.76" height="10.41"/>
        <rect className="cls-12" x="390" y="44.24" width="58.76" height="10.41"/>
        <rect className="cls-12" x="390" y="54.65" width="58.76" height="10.41"/>
        <rect className="cls-12" x="390" y="65.06" width="58.76" height="10.41"/>
        <rect className="cls-12" x="390" y="75.47" width="58.76" height="10.41"/>
        <rect className="cls-12" x="339" y="65.06" width="51" height="10.41"/>
        <rect className="cls-12" x="339" y="75.47" width="51" height="10.41"/>
        <rect className="cls-12" x="248.43" y="33.82" width="50.86" height="10.41"/>
        <rect className="cls-12" x="248.43" y="44.24" width="50.86" height="10.41"/>
        <rect className="cls-12" x="248.43" y="54.65" width="50.86" height="10.41"/>
        <rect className="cls-12" x="248.43" y="65.06" width="50.86" height="10.41"/>
        <rect className="cls-12" x="248.43" y="75.47" width="50.86" height="10.41"/>
        <rect className="cls-12" x="84.88" y="44.24" width="39.88" height="10.41"/>
        <rect className="cls-12" x="84.88" y="54.65" width="39.88" height="10.41"/>
        <rect className="cls-12" x="84.88" y="65.06" width="39.88" height="10.41"/>
        <rect className="cls-12" x="84.88" y="75.47" width="39.88" height="10.41"/>
        <rect className="cls-12" x="9" y="33.82" width="75.88" height="10.41"/>
        <rect className="cls-12" x="9" y="44.24" width="75.88" height="10.41"/>
        <rect className="cls-12" x="9" y="54.65" width="75.88" height="10.41"/>
        <rect className="cls-12" x="9" y="65.06" width="75.88" height="10.41"/>
      </g>

      {/* ========================================================================= */}
      {/* 2. STATIC LABELS + DYNAMIC HEADERS (CENTER-ALIGNED)                       */}
      {/* ========================================================================= */}
      <g id="static">
        <text className="cls-4" transform="translate(10.66 30.33)"><tspan x="0" y="0">Date</tspan></text>
        <text className="cls-4" transform="translate(10.66 40.74)"><tspan x="0" y="0">Daily Occupancy %</tspan></text>
        <text className="cls-4" transform="translate(10.66 51.15)"><tspan x="0" y="0">No of Villa Occupied</tspan></text>
        <text className="cls-4" transform="translate(126.25 51.15)"><tspan x="0" y="0">Anniversary Villas</tspan></text>
        <text className="cls-4" transform="translate(126.25 40.74)"><tspan x="0" y="0">Birthday Villas</tspan></text>
        <text className="cls-4" transform="translate(126.25 30.32)"><tspan x="0" y="0">Repeater Villas</tspan></text>
        <text className="cls-4" transform="translate(249.75 30.32)"><tspan x="0" y="0">Deep Cleaning</tspan></text>
        <text className="cls-3" transform="translate(145.27 19.07)"><tspan x="0" y="0">HOUSEKEEPING ALLOCATION REPORT</tspan></text>
        
        {/* Tier 1 Header: Jetty A (7 cols) */}
        <text className="cls-3" transform="translate(281.19 93.72)"><tspan x="0" y="0">JETTY A</tspan></text>
        <text className="cls-11" textAnchor="middle" transform="translate(50.25 104.87)"><tspan x="0" y="0">{t1[0]?.name || ""}</tspan></text>
        <text className="cls-11" textAnchor="middle" transform="translate(132.75 104.87)"><tspan x="0" y="0">{t1[1]?.name || ""}</tspan></text>
        <text className="cls-11" textAnchor="middle" transform="translate(215.26 104.87)"><tspan x="0" y="0">{t1[2]?.name || ""}</tspan></text>
        <text className="cls-11" textAnchor="middle" transform="translate(297.76 104.87)"><tspan x="0" y="0">{t1[3]?.name || ""}</tspan></text>
        <text className="cls-11" textAnchor="middle" transform="translate(380.27 104.87)"><tspan x="0" y="0">{t1[4]?.name || ""}</tspan></text>
        <text className="cls-11" textAnchor="middle" transform="translate(462.77 104.87)"><tspan x="0" y="0">{t1[5]?.name || ""}</tspan></text>
        <text className="cls-11" textAnchor="middle" transform="translate(545.28 104.87)"><tspan x="0" y="0">{t1[6]?.name || ""}</tspan></text>

        {/* Tier 2 Header: Jetty B & Jetty C (7 cols) */}
        <text className="cls-3" transform="translate(116.64 269.49)"><tspan x="0" y="0">JETTY B</tspan></text>
        <text className="cls-3" transform="translate(405.17 269.49)"><tspan x="0" y="0">JETTY C</tspan></text>
        <text className="cls-11" textAnchor="middle" transform="translate(50.25 280.63)"><tspan x="0" y="0">{t2[0]?.name || ""}</tspan></text>
        <text className="cls-11" textAnchor="middle" transform="translate(132.75 280.63)"><tspan x="0" y="0">{t2[1]?.name || ""}</tspan></text>
        <text className="cls-11" textAnchor="middle" transform="translate(215.26 280.63)"><tspan x="0" y="0">{t2[2]?.name || ""}</tspan></text>
        <text className="cls-11" textAnchor="middle" transform="translate(297.76 280.63)"><tspan x="0" y="0">{t2[3]?.name || ""}</tspan></text>
        <text className="cls-11" textAnchor="middle" transform="translate(380.27 280.63)"><tspan x="0" y="0">{t2[4]?.name || ""}</tspan></text>
        <text className="cls-11" textAnchor="middle" transform="translate(462.77 280.63)"><tspan x="0" y="0">{t2[5]?.name || ""}</tspan></text>
        <text className="cls-11" textAnchor="middle" transform="translate(545.28 280.63)"><tspan x="0" y="0">{t2[6]?.name || ""}</tspan></text>

        {/* Tier 3 Header: Beach (7 cols) */}
        <text className="cls-3" transform="translate(260 429.37)"><tspan x="0" y="0">BEACH VILLAS</tspan></text>
        <text className="cls-11" textAnchor="middle" transform="translate(50.25 440.52)"><tspan x="0" y="0">{t3[0]?.name || ""}</tspan></text>
        <text className="cls-11" textAnchor="middle" transform="translate(132.75 440.52)"><tspan x="0" y="0">{t3[1]?.name || ""}</tspan></text>
        <text className="cls-11" textAnchor="middle" transform="translate(215.26 440.52)"><tspan x="0" y="0">{t3[2]?.name || ""}</tspan></text>
        <text className="cls-11" textAnchor="middle" transform="translate(297.76 440.52)"><tspan x="0" y="0">{t3[3]?.name || ""}</tspan></text>
        <text className="cls-11" textAnchor="middle" transform="translate(380.27 440.52)"><tspan x="0" y="0">{t3[4]?.name || ""}</tspan></text>
        <text className="cls-11" textAnchor="middle" transform="translate(462.77 440.52)"><tspan x="0" y="0">{t3[5]?.name || ""}</tspan></text>
        <text className="cls-11" textAnchor="middle" transform="translate(545.28 440.52)"><tspan x="0" y="0">{t3[6]?.name || ""}</tspan></text>

        {/* Dynamic MV/CON Headers (Indices 0..6 for Tier 1, 7..13 for Tier 2, 14..20 for Tier 3) */}
        <text className="cls-11" transform="translate(12.11 115.52)"><tspan x="0" y="0">VILLA</tspan></text>
        <text className="cls-7" fill="#fff" textAnchor="middle" transform="translate(64.01 115.52)"><tspan x="0" y="0">{t1[0]?.contact || "MV/CON"}</tspan></text>
        <text className="cls-11" transform="translate(94.62 115.52)"><tspan x="0" y="0">VILLA</tspan></text>
        <text className="cls-7" fill="#fff" textAnchor="middle" transform="translate(146.51 115.52)"><tspan x="0" y="0">{t1[1]?.contact || "MV/CON"}</tspan></text>
        <text className="cls-11" transform="translate(177.12 115.52)"><tspan x="0" y="0">VILLA</tspan></text>
        <text className="cls-7" fill="#fff" textAnchor="middle" transform="translate(229.02 115.52)"><tspan x="0" y="0">{t1[2]?.contact || "MV/CON"}</tspan></text>
        <text className="cls-11" transform="translate(259.63 115.52)"><tspan x="0" y="0">VILLA</tspan></text>
        <text className="cls-7" fill="#fff" textAnchor="middle" transform="translate(311.52 115.52)"><tspan x="0" y="0">{t1[3]?.contact || "MV/CON"}</tspan></text>
        <text className="cls-11" transform="translate(342.13 115.52)"><tspan x="0" y="0">VILLA</tspan></text>
        <text className="cls-7" fill="#fff" textAnchor="middle" transform="translate(394.03 115.52)"><tspan x="0" y="0">{t1[4]?.contact || "MV/CON"}</tspan></text>
        <text className="cls-11" transform="translate(424.64 115.52)"><tspan x="0" y="0">VILLA</tspan></text>
        <text className="cls-7" fill="#fff" textAnchor="middle" transform="translate(476.53 115.52)"><tspan x="0" y="0">{t1[5]?.contact || "MV/CON"}</tspan></text>
        <text className="cls-11" transform="translate(507.14 115.52)"><tspan x="0" y="0">VILLA</tspan></text>
        <text className="cls-7" fill="#fff" textAnchor="middle" transform="translate(559.04 115.52)"><tspan x="0" y="0">{t1[6]?.contact || "MV/CON"}</tspan></text>

        <text className="cls-11" transform="translate(12.12 291.28)"><tspan x="0" y="0">VILLA</tspan></text>
        <text className="cls-7" fill="#fff" textAnchor="middle" transform="translate(64.01 291.28)"><tspan x="0" y="0">{t2[0]?.contact || "MV/CON"}</tspan></text>
        <text className="cls-11" transform="translate(94.62 291.28)"><tspan x="0" y="0">VILLA</tspan></text>
        <text className="cls-7" fill="#fff" textAnchor="middle" transform="translate(146.51 291.28)"><tspan x="0" y="0">{t2[1]?.contact || "MV/CON"}</tspan></text>
        <text className="cls-11" transform="translate(177.12 291.28)"><tspan x="0" y="0">VILLA</tspan></text>
        <text className="cls-7" fill="#fff" textAnchor="middle" transform="translate(229.02 291.28)"><tspan x="0" y="0">{t2[2]?.contact || "MV/CON"}</tspan></text>
        <text className="cls-11" transform="translate(259.56 291.28)"><tspan x="0" y="0">VILLA</tspan></text>
        <text className="cls-7" fill="#fff" textAnchor="middle" transform="translate(311.52 291.28)"><tspan x="0" y="0">{t2[3]?.contact || "MV/CON"}</tspan></text>
        <text className="cls-11" transform="translate(342.1 291.28)"><tspan x="0" y="0">VILLA</tspan></text>
        <text className="cls-7" fill="#fff" textAnchor="middle" transform="translate(394.03 291.28)"><tspan x="0" y="0">{t2[4]?.contact || "MV/CON"}</tspan></text>
        <text className="cls-11" transform="translate(424.64 291.28)"><tspan x="0" y="0">VILLA</tspan></text>
        <text className="cls-7" fill="#fff" textAnchor="middle" transform="translate(476.53 291.28)"><tspan x="0" y="0">{t2[5]?.contact || "MV/CON"}</tspan></text>
        <text className="cls-11" transform="translate(507.14 291.28)"><tspan x="0" y="0">VILLA</tspan></text>
        <text className="cls-7" fill="#fff" textAnchor="middle" transform="translate(559.04 291.28)"><tspan x="0" y="0">{t2[6]?.contact || "MV/CON"}</tspan></text>

        <text className="cls-11" transform="translate(12.12 451.16)"><tspan x="0" y="0">VILLA</tspan></text>
        <text className="cls-7" fill="#fff" textAnchor="middle" transform="translate(64.01 451.16)"><tspan x="0" y="0">{t3[0]?.contact || "MV/CON"}</tspan></text>
        <text className="cls-11" transform="translate(94.62 451.16)"><tspan x="0" y="0">VILLA</tspan></text>
        <text className="cls-7" fill="#fff" textAnchor="middle" transform="translate(146.51 451.16)"><tspan x="0" y="0">{t3[1]?.contact || "MV/CON"}</tspan></text>
        <text className="cls-11" transform="translate(176.59 451.16)"><tspan x="0" y="0">VILLA</tspan></text>
        <text className="cls-7" fill="#fff" textAnchor="middle" transform="translate(229.02 451.16)"><tspan x="0" y="0">{t3[2]?.contact || "MV/CON"}</tspan></text>
        <text className="cls-11" transform="translate(259.56 451.16)"><tspan x="0" y="0">VILLA</tspan></text>
        <text className="cls-7" fill="#fff" textAnchor="middle" transform="translate(311.52 451.16)"><tspan x="0" y="0">{t3[3]?.contact || "MV/CON"}</tspan></text>
        <text className="cls-11" transform="translate(342.1 451.16)"><tspan x="0" y="0">VILLA</tspan></text>
        <text className="cls-7" fill="#fff" textAnchor="middle" transform="translate(394.03 451.16)"><tspan x="0" y="0">{t3[4]?.contact || "MV/CON"}</tspan></text>
        <text className="cls-11" transform="translate(424.64 451.16)"><tspan x="0" y="0">VILLA</tspan></text>
        <text className="cls-7" fill="#fff" textAnchor="middle" transform="translate(476.53 451.16)"><tspan x="0" y="0">{t3[5]?.contact || "MV/CON"}</tspan></text>
        <text className="cls-11" transform="translate(507.14 451.16)"><tspan x="0" y="0">VILLA</tspan></text>
        <text className="cls-7" fill="#fff" textAnchor="middle" transform="translate(559.04 451.16)"><tspan x="0" y="0">{t3[6]?.contact || "MV/CON"}</tspan></text>

        {/* Lower Section Labels */}
        <text className="cls-2" transform="translate(73.26 571.7)"><tspan x="0" y="0">POOL DUTY</tspan></text>
        <text className="cls-2" transform="translate(198.61 571.7)"><tspan x="0" y="0">PUBLIC AREA DUTY</tspan></text>
        <text className="cls-2" transform="translate(317.76 571.78)"><tspan x="0" y="0">ADMIN DUTY</tspan></text>
        <text className="cls-2" transform="translate(413.57 571.78)"><tspan x="0" y="0">TAILOR DUTY</tspan></text>
        <text className="cls-2" transform="translate(498.57 570.86)"><tspan x="0" y="0">RUNNER / STEP DUTY</tspan></text>
        <text className="cls-2" transform="translate(414.99 628.92)"><tspan x="0" y="0">HOUSEMATE</tspan></text>
        <text className="cls-2" transform="translate(506.12 620.45)"><tspan x="0" y="0">LUGGAGE DUTY</tspan></text>

        <text className="cls-2" transform="translate(54.35 662.8)"><tspan x="0" y="0">GARDEN DUTY</tspan></text>
        <text className="cls-5" transform="translate(12.98 671.5)"><tspan x="0" y="0">DUTY INCHARGE</tspan></text>
        <text className="cls-5" transform="translate(66.22 671.5)"><tspan x="0" y="0">{d.garden?.incharge?.name || ""}</tspan></text>
        <text className="cls-5" transform="translate(123.87 671.59)"><tspan x="0" y="0">{d.garden?.incharge?.contact || ""}</tspan></text>

        <text className="cls-2" transform="translate(182.05 662.8)"><tspan x="0" y="0">LAUNDRY DUTY</tspan></text>
        <text className="cls-2" transform="translate(177.61 789.86)"><tspan x="0" y="0">PEST CONTROL</tspan></text>
        <text className="cls-2" transform="translate(314.26 662.8)"><tspan x="0" y="0">ANNUAL LEAVE</tspan></text>
        <text className="cls-2" transform="translate(483.1 662.8)"><tspan x="0" y="0">DAY OFF / PH</tspan></text>
        <text className="cls-2" transform="translate(313.26 772.9)"><tspan x="0" y="0">SICK / EL LEAVE</tspan></text>

        <text className="cls-2" transform="translate(33.25 765.45)"><tspan x="0" y="0">PUBLIC AREA SPECIAL TASK:</tspan></text>
        <text className="cls-2" transform="translate(45.24 806.8)"><tspan x="0" y="0">SPECIAL TASK VILLA</tspan></text>
        <text className="cls-7" transform="translate(10.93 814.91)"><tspan x="0" y="0">Deep Cleaning Villa:</tspan></text>
        <text className="cls-7" transform="translate(10.93 823.38)"><tspan x="0" y="0">Out of Order Villa:</tspan></text>
        <text className="cls-7" transform="translate(10.93 831.85)"><tspan x="0" y="0">House-Use Villa:</tspan></text>

        <text className="cls-8" transform="translate(482.33 18.72)"><tspan x="0" y="0">DAILY ICE REQUEST</tspan></text>
        <text className="cls-6" transform="translate(453.09 30.15)"><tspan x="0" y="0">VILLA</tspan></text>
        <text className="cls-6" transform="translate(496.02 30.15)"><tspan x="0" y="0">TIME</tspan></text>
        <text className="cls-6" transform="translate(552.82 30.15)"><tspan x="0" y="0">DEP</tspan></text>

        <text className="cls-4" transform="translate(340.72 30.32)"><tspan x="0" y="0">Sinner Villa</tspan></text>
        <text className="cls-4" transform="translate(340.72 40.74)"><tspan x="0" y="0">Saint Villa</tspan></text>
        <text className="cls-4" transform="translate(340.72 51.15)"><tspan x="0" y="0">Show Villa</tspan></text>
        <text className="cls-4" transform="translate(340.72 61.56)"><tspan x="0" y="0">Day Shut</tspan></text>
        <text className="cls-4" transform="translate(340.72 71.97)"><tspan x="0" y="0">Night Shut #1</tspan></text>
        <text className="cls-4" transform="translate(340.72 82.38)"><tspan x="0" y="0">Night Shut #2</tspan></text>
        <text className="cls-4" transform="translate(249.75 40.74)"><tspan x="0" y="0">Deck Cleaning</tspan></text>
        <text className="cls-4" transform="translate(249.75 51.15)"><tspan x="0" y="0">Out of Service</tspan></text>
        <text className="cls-4" transform="translate(249.75 61.56)"><tspan x="0" y="0">Maintenance</tspan></text>
        <text className="cls-4" transform="translate(249.75 71.97)"><tspan x="0" y="0">PMP Villas</tspan></text>
        <text className="cls-4" transform="translate(126.25 61.56)"><tspan x="0" y="0">Honeymoon Villas</tspan></text>
        <text className="cls-4" transform="translate(126.25 71.97)"><tspan x="0" y="0">Children In House</tspan></text>
        <text className="cls-4" transform="translate(126.25 82.38)"><tspan x="0" y="0">Guest In House</tspan></text>
        <text className="cls-4" transform="translate(10.66 61.56)"><tspan x="0" y="0">No of Villa Arr</tspan></text>
        <text className="cls-4" transform="translate(10.66 71.97)"><tspan x="0" y="0">No of Villa Dep</tspan></text>
        <text className="cls-4" transform="translate(10.66 82.38)"><tspan x="0" y="0">No of Villa Moves</tspan></text>
      </g>

      {/* ========================================================================= */}
      {/* 3. DYNAMIC VALUES (CENTER-ALIGNED & FORMATTED)                            */}
      {/* ========================================================================= */}
      <g id="Variable">
        {/* Top Summary Column 1 (cx = 104.82) */}
        <text className="cls-4" textAnchor="middle" transform="translate(104.82 30.33)"><tspan x="0" y="0">{formatDateDdMm(s.report_date)}</tspan></text>
        <text className="cls-4" textAnchor="middle" transform="translate(104.82 40.74)"><tspan x="0" y="0">{s.occupancy_pct !== undefined ? `${s.occupancy_pct}%` : ""}</tspan></text>
        <text className="cls-4" textAnchor="middle" transform="translate(104.82 51.15)"><tspan x="0" y="0">{formatTwoDigit(s.occupied_count)}</tspan></text>
        <text className="cls-4" textAnchor="middle" transform="translate(104.82 61.56)"><tspan x="0" y="0">{formatTwoDigit(s.arrivals_count)}</tspan></text>
        <text className="cls-4" textAnchor="middle" transform="translate(104.82 71.97)"><tspan x="0" y="0">{formatTwoDigit(s.departures_count)}</tspan></text>
        <text className="cls-4" textAnchor="middle" transform="translate(104.82 82.38)"><tspan x="0" y="0">{formatTwoDigit(s.villa_moves)}</tspan></text>

        {/* Top Summary Column 2 (cx = 218.11) */}
        <text className="cls-4" textAnchor="middle" transform="translate(218.11 30.32)"><tspan x="0" y="0">{s.repeater_villas || ""}</tspan></text>
        <text className="cls-4" textAnchor="middle" transform="translate(218.11 40.74)"><tspan x="0" y="0">{s.birthday_villas || ""}</tspan></text>
        <text className="cls-4" textAnchor="middle" transform="translate(218.11 51.15)"><tspan x="0" y="0">{s.anniversary_villas || ""}</tspan></text>
        <text className="cls-4" textAnchor="middle" transform="translate(218.11 61.56)"><tspan x="0" y="0">{s.honeymoon_villas || ""}</tspan></text>
        <text className="cls-4" textAnchor="middle" transform="translate(218.11 71.97)"><tspan x="0" y="0">{formatTwoDigit(s.children_count)}</tspan></text>
        <text className="cls-4" textAnchor="middle" transform="translate(218.11 82.38)"><tspan x="0" y="0">{formatTwoDigit(s.guest_in_house)}</tspan></text>

        {/* Top Summary Column 3 (cx = 319.14) */}
        <text className="cls-4" textAnchor="middle" transform="translate(319.14 31.17)"><tspan x="0" y="0">{s.deep_clean || ""}</tspan></text>
        <text className="cls-4" textAnchor="middle" transform="translate(319.14 41.58)"><tspan x="0" y="0">{s.deck_clean || ""}</tspan></text>
        <text className="cls-4" textAnchor="middle" transform="translate(319.14 51.15)"><tspan x="0" y="0">{s.oos_villas || ""}</tspan></text>
        <text className="cls-4" textAnchor="middle" transform="translate(319.14 61.56)"><tspan x="0" y="0">{s.maintenance_villas || ""}</tspan></text>
        <text className="cls-4" textAnchor="middle" transform="translate(319.14 71.97)"><tspan x="0" y="0">{s.pmp_villas || ""}</tspan></text>

        {/* Top Summary Column 4 (cx = 419.38) */}
        <text className="cls-4" textAnchor="middle" transform="translate(419.38 30.41)"><tspan x="0" y="0">{s.sinner_villa || ""}</tspan></text>
        <text className="cls-4" textAnchor="middle" transform="translate(419.38 40.74)"><tspan x="0" y="0">{s.saint_villa || ""}</tspan></text>
        <text className="cls-4" textAnchor="middle" transform="translate(419.38 51.15)"><tspan x="0" y="0">{s.show_villa || ""}</tspan></text>
        <text className="cls-4" textAnchor="middle" transform="translate(419.38 61.56)"><tspan x="0" y="0">{s.day_shut || ""}</tspan></text>
        <text className="cls-4" textAnchor="middle" transform="translate(419.38 71.97)"><tspan x="0" y="0">{s.night_shut_1 || ""}</tspan></text>
        <text className="cls-4" textAnchor="middle" transform="translate(419.38 82.38)"><tspan x="0" y="0">{s.night_shut_2 || ""}</tspan></text>

        {/* Ice Requests (6 Rows, Middle Aligned) */}
        {[0, 1, 2, 3, 4, 5].map((r) => {
          const y = 40.74 + r * 10.41;
          const req = d.iceRequests?.[r];
          return (
            <React.Fragment key={`ice-${r}`}>
              <text className="cls-4" textAnchor="middle" transform={`translate(462.70 ${y})`}><tspan x="0" y="0">{req?.villa || ""}</tspan></text>
              <text className="cls-4" textAnchor="middle" transform={`translate(504.12 ${y})`}><tspan x="0" y="0">{req?.time || ""}</tspan></text>
              <text className="cls-4" textAnchor="middle" transform={`translate(559.06 ${y})`}><tspan x="0" y="0">{req?.dep || ""}</tspan></text>
            </React.Fragment>
          );
        })}

        {/* Tier 1 Villa Rows (Jetty A: 9 Rows) */}
        {t1.map((col, cIdx) => {
          const xV = 9 + cIdx * 82.5 + 13.76;
          const xSt = 36.53 + cIdx * 82.5 + 27.48;
          return (
            <React.Fragment key={`t1-col-${cIdx}`}>
              {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((rIdx) => {
                const y = 128.35 + rIdx * 15.88;
                const v = col.villas?.[rIdx];
                return (
                  <React.Fragment key={`t1-${cIdx}-${rIdx}`}>
                    <text className="cls-4" textAnchor="middle" transform={`translate(${xV} ${y})`}><tspan x="0" y="0">{v?.number || ""}</tspan></text>
                    <text className="cls-4" textAnchor="middle" transform={`translate(${xSt} ${y})`}><tspan x="0" y="0">{v?.status || ""}</tspan></text>
                  </React.Fragment>
                );
              })}
            </React.Fragment>
          );
        })}

        {/* Tier 2 Villa Rows (Jetty B & C: 8 Rows) */}
        {t2.map((col, cIdx) => {
          const xV = 9 + cIdx * 82.5 + 13.76;
          const xSt = 36.53 + cIdx * 82.5 + 27.48;
          return (
            <React.Fragment key={`t2-col-${cIdx}`}>
              {[0, 1, 2, 3, 4, 5, 6, 7].map((rIdx) => {
                const y = 304.12 + rIdx * 15.88;
                const v = col.villas?.[rIdx];
                return (
                  <React.Fragment key={`t2-${cIdx}-${rIdx}`}>
                    <text className="cls-4" textAnchor="middle" transform={`translate(${xV} ${y})`}><tspan x="0" y="0">{v?.number || ""}</tspan></text>
                    <text className="cls-4" textAnchor="middle" transform={`translate(${xSt} ${y})`}><tspan x="0" y="0">{v?.status || ""}</tspan></text>
                  </React.Fragment>
                );
              })}
            </React.Fragment>
          );
        })}

        {/* Tier 3 Villa Rows (Beach: 7 Rows) */}
        {t3.map((col, cIdx) => {
          const xV = 9 + cIdx * 82.5 + 13.76;
          const xSt = 36.53 + cIdx * 82.5 + 27.48;
          return (
            <React.Fragment key={`t3-col-${cIdx}`}>
              {[0, 1, 2, 3, 4, 5, 6].map((rIdx) => {
                const y = 464 + rIdx * 15.88;
                const v = col.villas?.[rIdx];
                return (
                  <React.Fragment key={`t3-${cIdx}-${rIdx}`}>
                    <text className="cls-4" textAnchor="middle" transform={`translate(${xV} ${y})`}><tspan x="0" y="0">{v?.number || ""}</tspan></text>
                    <text className="cls-4" textAnchor="middle" transform={`translate(${xSt} ${y})`}><tspan x="0" y="0">{v?.status || ""}</tspan></text>
                  </React.Fragment>
                );
              })}
            </React.Fragment>
          );
        })}

        {/* Pool Duty Block */}
        {[0, 1, 2, 3, 4].map((i) => {
          const y = 586.77 + i * 8.47;
          return (
            <React.Fragment key={`pool-h-${i}`}>
              <text className="cls-4" transform={`translate(10.65 ${y})`}><tspan x="0" y="0">{d.pool?.hosts?.[i]?.name || ""}</tspan></text>
              <text className="cls-4" transform={`translate(67.2 ${y})`}><tspan x="0" y="0">{d.pool?.hosts?.[i]?.mvpn || ""}</tspan></text>
              <text className="cls-4" transform={`translate(96.06 ${y})`}><tspan x="0" y="0">{d.pool?.hosts?.[i]?.allocation || ""}</tspan></text>
            </React.Fragment>
          );
        })}
        {[0, 1, 2].map((i) => {
          const y = 637.59 + i * 8.47;
          return (
            <React.Fragment key={`pool-sub-${i}`}>
              <text className="cls-4" transform={`translate(10.65 ${y})`}><tspan x="0" y="0">{d.pool?.night?.[i] || ""}</tspan></text>
              <text className="cls-4" transform={`translate(66.22 ${y})`}><tspan x="0" y="0">{d.pool?.mod?.[i] || ""}</tspan></text>
              <text className="cls-4" transform={`translate(121.63 ${y})`}><tspan x="0" y="0">{d.pool?.continueShift?.[i] || ""}</tspan></text>
            </React.Fragment>
          );
        })}

        {/* Public Area Duty */}
        {[0, 1, 2].map((i) => (
          <text key={`pa-mf-${i}`} className="cls-4" transform={`translate(176.34 ${586.77 + i * 8.47})`}><tspan x="0" y="0">{d.publicArea?.morningFoh?.[i] || ""}</tspan></text>
        ))}
        {[0, 1].map((i) => (
          <text key={`pa-mb-${i}`} className="cls-4" transform={`translate(176.34 ${620.65 + i * 8.47})`}><tspan x="0" y="0">{d.publicArea?.morningBoh?.[i] || ""}</tspan></text>
        ))}
        <text className="cls-4" transform="translate(176.34 646.06)"><tspan x="0" y="0">{d.publicArea?.afternoonFoh?.[0] || ""}</tspan></text>
        <text className="cls-4" transform="translate(176.34 654.53)"><tspan x="0" y="0">{d.publicArea?.afternoonBoh?.[0] || ""}</tspan></text>

        {/* Public Area Extensions */}
        <text className="cls-4" transform="translate(249.64 586.77)"><tspan x="0" y="0">2842</tspan></text>
        <text className="cls-4" transform="translate(249.64 595.24)"><tspan x="0" y="0">2842</tspan></text>
        <text className="cls-4" transform="translate(249.64 603.71)"><tspan x="0" y="0">2842</tspan></text>
        <text className="cls-4" transform="translate(249.64 620.65)"><tspan x="0" y="0">2848</tspan></text>
        <text className="cls-4" transform="translate(249.64 629.12)"><tspan x="0" y="0">2848</tspan></text>
        <text className="cls-4" transform="translate(237.67 646.06)"><tspan x="0" y="0">2842</tspan></text>
        <text className="cls-4" transform="translate(261.54 654.53)"><tspan x="0" y="0">2848</tspan></text>

        {/* Admin Duty */}
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <React.Fragment key={`adm-${i}`}>
            <text className="cls-4" transform={`translate(286.67 ${586.77 + i * 8.47})`}><tspan x="0" y="0">{d.admin?.[i]?.name || ""}</tspan></text>
            <text className="cls-4" transform={`translate(340.58 ${586.77 + i * 8.47})`}><tspan x="0" y="0">{d.admin?.[i]?.contact || ""}</tspan></text>
          </React.Fragment>
        ))}

        {/* Tailor & Housemate */}
        {[0, 1, 2, 3, 4].map((i) => (
          <React.Fragment key={`tailor-${i}`}>
            <text className="cls-4" transform={`translate(395.68 ${586.77 + i * 8.47})`}><tspan x="0" y="0">{d.tailor?.[i]?.name || ""}</tspan></text>
            <text className="cls-4" transform={`translate(450.74 ${586.77 + i * 8.47})`}><tspan x="0" y="0">{d.tailor?.[i]?.no || ""}</tspan></text>
          </React.Fragment>
        ))}
        {[0, 1, 2].map((i) => (
          <React.Fragment key={`hsm-${i}`}>
            <text className="cls-4" transform={`translate(395.68 ${637.15 + i * 8.38})`}><tspan x="0" y="0">{d.housemate?.[i]?.name || ""}</tspan></text>
            <text className="cls-4" transform={`translate(451.55 ${637.15 + i * 8.38})`}><tspan x="0" y="0">{d.housemate?.[i]?.no || ""}</tspan></text>
          </React.Fragment>
        ))}

        {/* Runner, Step, Luggage */}
        <text className="cls-4" transform="translate(478.6 586.77)"><tspan x="0" y="0">{d.runnerStepLuggage?.runner?.[0]?.name || ""}</tspan></text>
        <text className="cls-4" transform="translate(533.23 586.77)"><tspan x="0" y="0">{d.runnerStepLuggage?.runner?.[0]?.duty || ""}</tspan></text>
        <text className="cls-4" transform="translate(560.91 586.77)"><tspan x="0" y="0">{d.runnerStepLuggage?.runner?.[0]?.mvpn || ""}</tspan></text>
        <text className="cls-4" transform="translate(478.6 595.24)"><tspan x="0" y="0">{d.runnerStepLuggage?.runner?.[1]?.name || ""}</tspan></text>
        <text className="cls-4" transform="translate(533.23 595.24)"><tspan x="0" y="0">{d.runnerStepLuggage?.runner?.[1]?.duty || ""}</tspan></text>
        <text className="cls-4" transform="translate(560.91 595.24)"><tspan x="0" y="0">{d.runnerStepLuggage?.runner?.[1]?.mvpn || ""}</tspan></text>
        <text className="cls-4" transform="translate(478.6 612.18)"><tspan x="0" y="0">{d.runnerStepLuggage?.step?.[0]?.name || ""}</tspan></text>
        <text className="cls-4" transform="translate(533.04 612.18)"><tspan x="0" y="0">{d.runnerStepLuggage?.step?.[0]?.duty || ""}</tspan></text>
        <text className="cls-4" transform="translate(561.3 612.18)"><tspan x="0" y="0">{d.runnerStepLuggage?.step?.[0]?.mvpn || ""}</tspan></text>
        {[0, 1, 2].map((i) => (
          <React.Fragment key={`lug-${i}`}>
            <text className="cls-4" transform={`translate(478.61 ${637.59 + i * 8.47})`}><tspan x="0" y="0">{d.runnerStepLuggage?.luggage?.[i]?.name || ""}</tspan></text>
            <text className="cls-4" transform={`translate(532.47 ${637.59 + i * 8.47})`}><tspan x="0" y="0">{d.runnerStepLuggage?.luggage?.[i]?.duty || ""}</tspan></text>
            <text className="cls-4" transform={`translate(565.99 ${637.59 + i * 8.47})`}><tspan x="0" y="0">2844</tspan></text>
          </React.Fragment>
        ))}

        {/* Garden Duty (8 rows) */}
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <React.Fragment key={`gar-${i}`}>
            <text className="cls-4" transform={`translate(10.93 ${688.41 + i * 8.47})`}><tspan x="0" y="0">{d.garden?.hosts?.[i]?.name || ""}</tspan></text>
            <text className="cls-4" transform={`translate(66.26 ${688.41 + i * 8.47})`}><tspan x="0" y="0">{d.garden?.hosts?.[i]?.contact || ""}</tspan></text>
            <text className="cls-4" transform={`translate(96.59 ${688.41 + i * 8.47})`}><tspan x="0" y="0">{d.garden?.hosts?.[i]?.area || ""}</tspan></text>
          </React.Fragment>
        ))}

        {/* Laundry Duty (10 rows) */}
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
          <React.Fragment key={`lnd-${i}`}>
            <text className="cls-4" transform={`translate(148.32 ${688.41 + i * 8.47})`}><tspan x="0" y="0">{d.laundry?.[i]?.name || ""}</tspan></text>
            <text className="cls-4" transform={`translate(211.67 ${688.41 + i * 8.47})`}><tspan x="0" y="0">{d.laundry?.[i]?.no || ""}</tspan></text>
          </React.Fragment>
        ))}

        {/* Pest Control (4 rows) */}
        {[0, 1, 2, 3].map((i) => (
          <React.Fragment key={`pest-${i}`}>
            <text className="cls-4" transform={`translate(148.32 ${807 + i * 8.47})`}><tspan x="0" y="0">{d.pestControl?.[i]?.name || ""}</tspan></text>
            <text className="cls-4" transform={`translate(215.06 ${807 + i * 8.47})`}><tspan x="0" y="0">{d.pestControl?.[i]?.no || ""}</tspan></text>
          </React.Fragment>
        ))}

        {/* Public Area Special Tasks (4 rows) */}
        <text className="cls-1" transform="translate(10.93 773.11)"><tspan x="0" y="0">{d.publicArea?.specialTasks?.[0] || d.specialTasks?.task1 || ""}</tspan></text>
        <text className="cls-1" transform="translate(10.93 781.14)"><tspan x="0" y="0">{d.publicArea?.specialTasks?.[1] || d.specialTasks?.task2 || ""}</tspan></text>
        <text className="cls-1" transform="translate(10.93 789.61)"><tspan x="0" y="0">{d.publicArea?.specialTasks?.[2] || d.specialTasks?.task3 || ""}</tspan></text>
        <text className="cls-1" transform="translate(10.93 798.08)"><tspan x="0" y="0">{d.publicArea?.specialTasks?.[3] || d.specialTasks?.task4 || ""}</tspan></text>

        {/* Special Task Villas */}
        <text className="cls-9" transform="translate(87.84 815.68)"><tspan x="0" y="0">{s.deep_clean || ""}</tspan></text>
        <text className="cls-9" transform="translate(87.71 824.15)"><tspan x="0" y="0">{s.oos_villas || ""}</tspan></text>
        <text className="cls-9" transform="translate(89.73 832.62)"><tspan x="0" y="0">{d.specialTasks?.huVilla || ""}</tspan></text>

        {/* Annual Leave (11 rows) */}
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => {
          const y = 680.01 + i * 8.47;
          const al = d.annualLeave?.[i];
          return (
            <React.Fragment key={`al-${i}`}>
              <text className="cls-4" transform={`translate(258.8 ${y})`}><tspan x="0" y="0">{al?.name || ""}</tspan></text>
              <text className="cls-4" transform={`translate(328 ${y})`}><tspan x="0" y="0">{formatDateDdMm(al?.from)}</tspan></text>
              <text className="cls-4" transform={`translate(364.3 ${y})`}><tspan x="0" y="0">{formatDateDdMm(al?.to)}</tspan></text>
              <text className="cls-4" transform={`translate(393.68 ${y})`}><tspan x="0" y="0">{al?.duration || ""}</tspan></text>
            </React.Fragment>
          );
        })}

        {/* Sick / EL Leave (6 rows) */}
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const y = 790.06 + i * 8.47;
          const sl = d.sickLeave?.[i];
          return (
            <React.Fragment key={`sl-${i}`}>
              <text className="cls-4" transform={`translate(258.92 ${y})`}><tspan x="0" y="0">{sl?.name || ""}</tspan></text>
              <text className="cls-4" transform={`translate(328.11 ${y})`}><tspan x="0" y="0">{formatDateDdMm(sl?.from)}</tspan></text>
              <text className="cls-4" transform={`translate(364.46 ${y})`}><tspan x="0" y="0">{formatDateDdMm(sl?.to)}</tspan></text>
              <text className="cls-4" transform={`translate(395.16 ${y})`}><tspan x="0" y="0">{sl?.duration || ""}</tspan></text>
            </React.Fragment>
          );
        })}

        {/* Day Off / PH (19 rows) */}
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18].map((i) => {
          const y = 679.95 + i * 8.47;
          const off = d.dayOff?.[i];
          return (
            <React.Fragment key={`off-${i}`}>
              <text className="cls-4" transform={`translate(424.16 ${y})`}><tspan x="0" y="0">{off?.name || ""}</tspan></text>
              <text className="cls-4" transform={`translate(492.59 ${y})`}><tspan x="0" y="0">{formatDateDdMm(off?.from)}</tspan></text>
              <text className="cls-4" transform={`translate(527.62 ${y})`}><tspan x="0" y="0">{formatDateDdMm(off?.to)}</tspan></text>
              <text className="cls-4" transform={`translate(558.34 ${y})`}><tspan x="0" y="0">{off?.duration || ""}</tspan></text>
            </React.Fragment>
          );
        })}
      </g>
    </svg>
  );
}