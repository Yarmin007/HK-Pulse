import { differenceInDays, parseISO, isAfter, isBefore, addDays, startOfDay } from 'date-fns';

export const WORKING_CODES = ['P']; 
export const LEAVE_CODES = ['O', 'OFF', 'AL', 'VAC', 'PH', 'RR', 'SL', 'NP', 'A', 'CL', 'PA', 'MA', 'EL', 'OT'];

export const getPayrollPeriod = (date = new Date()) => {
  const d = new Date(date);
  let year = d.getFullYear();
  let month = d.getMonth();
  if (d.getDate() >= 21) {
      return { start: new Date(year, month, 21), end: new Date(year, month + 1, 20) };
  } else {
      return { start: new Date(year, month - 1, 21), end: new Date(year, month, 20) };
  }
};

export const getUpcomingLeave = (futureLeaves: any[], todayStr: string) => {
    if (!futureLeaves || futureLeaves.length === 0) return null;
    
    const today = startOfDay(parseISO(todayStr)); 

    const sorted = [...futureLeaves].sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime());
    if (sorted.length === 0) return null;

    let blocks = [];
    let currentBlock = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
        const prevDate = parseISO(currentBlock[currentBlock.length - 1].date);
        const currDate = parseISO(sorted[i].date);
        
        if (differenceInDays(currDate, prevDate) === 1) {
            currentBlock.push(sorted[i]);
        } else {
            blocks.push([...currentBlock]);
            currentBlock = [sorted[i]];
        }
    }
    blocks.push([...currentBlock]);

    const nextLeaveBlock = blocks[0];
    const startDate = parseISO(nextLeaveBlock[0].date);
    const endDate = parseISO(nextLeaveBlock[nextLeaveBlock.length - 1].date);
    const returnDate = addDays(endDate, 1);
    const daysUntilLeave = differenceInDays(startDate, today);

    return {
        startDate, endDate, returnDate, daysUntilLeave,
        totalLeaveDays: nextLeaveBlock.length,
        isOnLeaveNow: daysUntilLeave <= 0 && today <= endDate
    };
};

export const computeLeaveBalancesRPC = (
    host: any, 
    currentYearData: any[], // Raw rows (used by Attendance Page)
    historicalStats: any[], // Aggregated RPC data (used by Dashboard & History)
    targetDateStr: string, 
    publicHolidays: any[], 
    anniversaryLeaves: any[] // Raw SL/EL/RR
) => {
    if (!host || !historicalStats) return null;
    const targetDate = parseISO(targetDateStr);
    const targetYear = targetDate.getFullYear();
    const SYSTEM_START_DATE = new Date(2026, 0, 1); 
    
    const baseCfOff = host.cf_off || 0;
    const baseCfAL = host.cf_al || 0;
    const baseCfPH = host.cf_ph || 0;

    const joinDate = host.joining_date ? parseISO(host.joining_date) : SYSTEM_START_DATE;
    const isExec = ['DA', 'DB'].includes(host.host_level);
    const isIntern = (host.role || '').toLowerCase().includes('intern');

    const hostCurrentStats = (currentYearData || []).filter((r: any) => String(r.host_id).trim() === String(host.host_id).trim());
    const hostHistStats = historicalStats.filter((r: any) => String(r.host_id).trim() === String(host.host_id).trim());

    const hasRawCurrentData = currentYearData && currentYearData.length > 0;

    // ⚡ SMART FALLBACK: Handles string/number mismatches from Supabase DB payload
    const getStat = (year: number, codes: string[]) => {
        if (hasRawCurrentData) {
            return hostCurrentStats.filter((r: any) => {
                if (!r.date) return false;
                const d = parseISO(r.date.includes('T') ? r.date.split('T')[0] : r.date);
                const statCode = String(r.status_code).trim().toUpperCase();
                return d.getFullYear() === year && d <= targetDate && codes.includes(statCode);
            }).length;
        } else {
            return hostHistStats
                .filter((r: any) => Number(r.att_year) === year && codes.includes(String(r.status_code).trim().toUpperCase()))
                .reduce((sum: number, r: any) => sum + Number(r.total), 0);
        }
    };

    const getHistoricalStat = (year: number, codes: string[]) => {
        return hostHistStats
            .filter((r: any) => Number(r.att_year) === year && codes.includes(String(r.status_code).trim().toUpperCase()))
            .reduce((sum: number, r: any) => sum + Number(r.total), 0);
    };

    let currentCfOff = baseCfOff; 
    let currentCfAL = baseCfAL; 
    let currentCfPH = baseCfPH;

    const startYear = Math.max(2026, joinDate.getFullYear());

    for (let calcYear = startYear; calcYear < targetYear; calcYear++) {
        const startOfCalcYear = new Date(calcYear, 0, 1);
        const endOfCalcYear = new Date(calcYear, 11, 31);
        
        const trackingStart = isAfter(joinDate, startOfCalcYear) ? joinDate : startOfCalcYear;
        
        const daysActive = differenceInDays(endOfCalcYear, trackingStart) + 1;
        const penaltyDays = getHistoricalStat(calcYear, ['NP', 'A']);
        const eligibleDays = Math.max(0, daysActive - penaltyDays);
        
        const earnedOff = eligibleDays / 7;
        const earnedAL = isIntern ? 0 : (eligibleDays / 12);
        
        let earnedPH = 0;
        publicHolidays.forEach((ph: any) => {
            const phDate = parseISO(ph.date);
            if (phDate >= trackingStart && phDate <= endOfCalcYear) earnedPH += 1;
        });

        // ⚡ OT IS STRICTLY EXCLUDED FROM NORMAL DEDUCTIONS (Handled in Overtime Module)
        const takenOff = getHistoricalStat(calcYear, ['O', 'OFF']); 
        const takenAL = getHistoricalStat(calcYear, ['AL', 'VAC']);
        const takenPH = getHistoricalStat(calcYear, ['PH']);

        currentCfOff = currentCfOff + earnedOff - takenOff;
        currentCfAL = currentCfAL + earnedAL - takenAL;
        currentCfPH = currentCfPH + earnedPH - takenPH;
    }

    const calcCfOff = currentCfOff;
    const calcCfAL = currentCfAL;
    const calcCfPH = currentCfPH;

    const startOfTargetYear = new Date(targetYear, 0, 1);
    const trackingStartThisYear = isAfter(joinDate, startOfTargetYear) ? joinDate : startOfTargetYear;
    
    let earnedOff = 0; let earnedAL = 0; let earnedPH = 0;
    
    if (targetDate >= trackingStartThisYear) {
        const daysActive = differenceInDays(targetDate, trackingStartThisYear) + 1;
        const penaltyDays = getStat(targetYear, ['NP', 'A']);
        const eligibleDays = Math.max(0, daysActive - penaltyDays);
        
        earnedOff = eligibleDays / 7;
        earnedAL = isIntern ? 0 : (eligibleDays / 12);
    }

    publicHolidays.forEach((ph: any) => {
        const phDate = parseISO(ph.date);
        if (phDate >= trackingStartThisYear && phDate <= targetDate) {
            earnedPH += 1;
        }
    });

    const takenOff = getStat(targetYear, ['O', 'OFF']);
    const takenAL = getStat(targetYear, ['AL', 'VAC']);
    const takenPH = getStat(targetYear, ['PH']);

    let lastAnniversary = new Date(joinDate);
    lastAnniversary.setFullYear(targetYear);
    if (joinDate.getMonth() === 1 && joinDate.getDate() === 29 && !isLeapYear(targetYear)) {
        lastAnniversary = new Date(targetYear, 1, 28);
    }
    if (isAfter(lastAnniversary, targetDate)) {
        lastAnniversary.setFullYear(targetYear - 1);
    }
    
    // Uses Anniversary Leaves if provided, else falls back to local year data
    const rawAnniversaryData = (anniversaryLeaves && anniversaryLeaves.length > 0) ? anniversaryLeaves : hostCurrentStats;
    const myAnniversaryLeaves = rawAnniversaryData.filter((a: any) => {
        if (String(a.host_id).trim() !== String(host.host_id).trim()) return false;
        if (!a.date) return false;
        const d = parseISO(a.date.includes('T') ? a.date.split('T')[0] : a.date);
        return d >= lastAnniversary && d <= targetDate;
    });

    const takenSL = myAnniversaryLeaves.filter((a: any) => String(a.status_code).toUpperCase().trim() === 'SL').length;
    const takenEL = myAnniversaryLeaves.filter((a: any) => String(a.status_code).toUpperCase().trim() === 'EL').length;
    const takenRR = myAnniversaryLeaves.filter((a: any) => String(a.status_code).toUpperCase().trim() === 'RR').length;

    const balOffVal = currentCfOff + earnedOff - takenOff;
    const balALVal = isIntern ? 0 : (currentCfAL + earnedAL - takenAL);
    const balPHVal = currentCfPH + earnedPH - takenPH;
    const balRRVal = isExec ? 7 - takenRR : 0;
    const totalBal = balOffVal + balALVal + balPHVal + balRRVal;

    return {
        balOff: balOffVal.toFixed(1),
        balAL: isIntern ? '0.0' : balALVal.toFixed(1),
        balPH: balPHVal.toFixed(1),
        balRR: isExec ? balRRVal.toString() : '-',
        balTotal: totalBal.toFixed(1),
        balSL: 30 - takenSL,
        balEL: 10 - takenEL,
        calcCfOff: calcCfOff.toFixed(1),
        calcCfAL: calcCfAL.toFixed(1),  
        calcCfPH: calcCfPH.toFixed(1)   
    };
};

function isLeapYear(year: number) {
    return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}