"use client";
// Print-only Monthly Roster. Rendered straight into <body> and the only thing on the printed page:
// plain table, solid colours, no sticky columns or see-through fills (those made Chrome print the
// old sheet as a blurry picture). The checklist column is not printed.
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { format, parseISO } from 'date-fns';
import { CODE_COLORS, CODE_NAMES, FRIDAY_FILL, PH_FILL, BLOCK_FILL, type RosterGroup, type RosterCell } from './rosterShared';

export type Paper = 'A4' | 'A3';

type Props = {
  paper: Paper;
  title: string;            // e.g. "November 2026"
  range: string;            // e.g. "21 Oct – 20 Nov 2026"
  scope: string;            // department or "All sub-departments"
  dates: string[];
  phDates: Set<string>;
  groups: RosterGroup[];
  cellOf: (hostId: string, date: string) => RosterCell;
  cfLabel: string;          // "20 Oct"
  balLabel: string;         // "20 Nov"
  printedBy: string;
};

export default function RosterPrint(p: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(<RosterPrintSheet {...p} />, document.body);
}

/** The sheet itself (no portal), so it can also be rendered on its own. */
export function RosterPrintSheet(p: Props) {
  const used = new Set<string>();
  p.groups.forEach(g => g.hosts.forEach(h => p.dates.forEach(d => { const c = p.cellOf(h.host_id, d).code; if (c && c !== 'P') used.add(c); })));
  const legend = Object.keys(CODE_COLORS).filter(c => used.has(c));
  const total = p.groups.reduce((n, g) => n + g.hosts.length, 0);
  const big = p.paper === 'A3';

  return (
    <div id="roster-print-root">
      <style>{`
        #roster-print-root { display: none; }
        @media print {
          @page { size: ${p.paper} landscape; margin: 8mm; }
          html, body { background: #fff !important; }
          body > *:not(#roster-print-root) { display: none !important; }
          #roster-print-root { display: block; }
          #roster-print-root, #roster-print-root * {
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
            font-family: Arial, Helvetica, sans-serif; color: #0f172a; text-shadow: none; box-shadow: none;
          }
          .rp-head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 1.5pt solid #6D2158; padding-bottom: 2mm; margin-bottom: 2.5mm; }
          .rp-head h1 { font-size: ${big ? 16 : 13}pt; font-weight: 700; margin: 0; color: #6D2158; letter-spacing: 0.2pt; }
          .rp-head .sub { font-size: ${big ? 9 : 8}pt; color: #475569; margin-top: 0.8mm; }
          .rp-head .right { text-align: right; }
          .rp-head .right b { display: block; font-size: ${big ? 13 : 11}pt; color: #0f172a; }
          table.rp { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: ${big ? 8.5 : 7}pt; }
          table.rp th, table.rp td { border: 0.5pt solid #94a3b8; padding: 0; text-align: center; vertical-align: middle; overflow: hidden; white-space: nowrap; }
          table.rp thead { display: table-header-group; }
          table.rp tr { break-inside: avoid; page-break-inside: avoid; }
          table.rp thead th { background: #f1f5f9; font-weight: 700; height: ${big ? 8 : 6.5}mm; }
          table.rp thead th .d { display: block; font-size: ${big ? 8.5 : 7}pt; line-height: 1.1; }
          table.rp thead th .w { display: block; font-size: ${big ? 6.5 : 5.5}pt; font-weight: 400; color: #475569; line-height: 1.1; }
          table.rp th.name, table.rp td.name { text-align: left; padding: 0 1.2mm; }
          table.rp td.name .n { font-weight: 700; display: block; overflow: hidden; text-overflow: ellipsis; line-height: 1.15; }
          table.rp td.name .i { font-size: ${big ? 6.5 : 5.5}pt; color: #64748b; display: block; line-height: 1.1; }
          table.rp tbody td { height: ${big ? 6.2 : 4.7}mm; font-weight: 700; }
          table.rp tr.grp td { background: #e2e8f0; font-weight: 700; text-align: left; padding: 0 1.5mm; height: ${big ? 5.5 : 4.4}mm; font-size: ${big ? 8 : 6.8}pt; text-transform: uppercase; letter-spacing: 0.4pt; color: #6D2158; }
          table.rp .bal { font-weight: 700; }
          table.rp .bal-first { border-left: 1.2pt solid #475569; }
          table.rp .worked { text-decoration: underline; }
          .rp-foot { display: flex; justify-content: space-between; align-items: flex-start; gap: 6mm; margin-top: 2.5mm; font-size: ${big ? 7.5 : 6.5}pt; color: #334155; }
          .rp-legend { display: flex; flex-wrap: wrap; gap: 1mm 3mm; align-items: center; }
          .rp-legend span.k { display: inline-block; min-width: 5mm; padding: 0 0.8mm; text-align: center; font-weight: 700; border: 0.5pt solid #94a3b8; margin-right: 0.8mm; }
          .rp-sign { display: flex; gap: 8mm; white-space: nowrap; }
          .rp-sign div { border-top: 0.6pt solid #334155; padding-top: 0.8mm; min-width: 38mm; text-align: center; margin-top: 5mm; }
        }
      `}</style>

      <div className="rp-head">
        <div>
          <h1>Housekeeping · Monthly Roster</h1>
          <div className="sub">{p.scope} · {total} host{total === 1 ? '' : 's'}</div>
        </div>
        <div className="right">
          <b>{p.title}</b>
          <span className="sub">{p.range}</span>
        </div>
      </div>

      <table className="rp">
        <colgroup>
          <col style={{ width: big ? '52mm' : '38mm' }} />
          {p.dates.map(d => <col key={d} />)}
          {[0, 1, 2, 3, 4].map(i => <col key={i} style={{ width: big ? '10mm' : '7.6mm' }} />)}
        </colgroup>
        <thead>
          <tr>
            <th className="name">Host</th>
            {p.dates.map(d => {
              const dt = parseISO(d);
              const bg = p.phDates.has(d) ? PH_FILL : dt.getDay() === 5 ? FRIDAY_FILL : undefined;
              return <th key={d} style={bg ? { background: bg } : undefined}><span className="d">{format(dt, 'd')}</span><span className="w">{format(dt, 'EEEEE')}</span></th>;
            })}
            <th className="bal-first" title={`Carried forward ${p.cfLabel}`}><span className="d">CF</span><span className="w">OFF</span></th>
            <th><span className="d">CF</span><span className="w">PH</span></th>
            <th className="bal-first"><span className="d">OFF</span><span className="w">{p.balLabel}</span></th>
            <th><span className="d">PH</span><span className="w">{p.balLabel}</span></th>
            <th><span className="d">AL</span><span className="w">{p.balLabel}</span></th>
          </tr>
        </thead>
        <tbody>
          {p.groups.map(g => (
            <React.Fragment key={g.dep}>
              <tr className="grp"><td colSpan={p.dates.length + 6}>{g.dep} · {g.hosts.length}</td></tr>
              {g.hosts.map(h => (
                <tr key={h.host_id}>
                  <td className="name"><span className="n">{h.full_name}</span><span className="i">{h.host_id}</span></td>
                  {p.dates.map(d => {
                    const c = p.cellOf(h.host_id, d);
                    if (c.blocked) return <td key={d} style={{ background: BLOCK_FILL }} />;
                    const col = CODE_COLORS[c.code];
                    const bg = col ? col[0] : p.phDates.has(d) ? PH_FILL : parseISO(d).getDay() === 5 ? FRIDAY_FILL : undefined;
                    return (
                      <td key={d} className={c.worked ? 'worked' : undefined} style={{ background: bg, color: col ? col[1] : undefined }}>
                        {c.code === 'P' ? '' : c.code}
                      </td>
                    );
                  })}
                  <td className="bal bal-first">{h.cfOff || '0'}</td>
                  <td className="bal">{h.cfPH || '0'}</td>
                  <td className="bal bal-first">{h.balOff || '0'}</td>
                  <td className="bal">{h.balPH || '0'}</td>
                  <td className="bal">{h.balAL || '0'}</td>
                </tr>
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>

      <div className="rp-foot">
        <div>
          <div className="rp-legend">
            {legend.map(c => (
              <span key={c}><span className="k" style={{ background: CODE_COLORS[c][0], color: CODE_COLORS[c][1] }}>{c}</span>{CODE_NAMES[c] || ''}</span>
            ))}
            <span><span className="k" style={{ background: BLOCK_FILL }}>&nbsp;</span>Not on roster</span>
            <span><span className="k" style={{ textDecoration: 'underline' }}>O</span>Leave day worked (earns RO)</span>
            <span>Blank = present · CF = carried forward from {p.cfLabel} · balances at {p.balLabel}</span>
          </div>
          <div style={{ marginTop: '1.5mm', color: '#64748b' }}>Printed {format(new Date(), 'dd MMM yyyy, HH:mm')}{p.printedBy ? ` by ${p.printedBy}` : ''}</div>
        </div>
        <div className="rp-sign"><div>Prepared by</div><div>Checked by</div></div>
      </div>
    </div>
  );
}
