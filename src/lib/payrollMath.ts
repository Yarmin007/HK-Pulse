import { differenceInDays, parseISO, isAfter, isBefore, addDays } from 'date-fns';

export const LEAVE_CODES = ['O', 'OFF', 'AL', 'VAC', 'PH', 'RR'];

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

export const getUpcomingLeave = (futureLeaves: any[]) => {
    if (!futureLeaves || futureLeaves.length === 0) return null;
    const today = new Date();
    today.setHours(0,0,0,0); 

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
        isOnLeaveNow: daysUntilLeave <= 0 && today <= endDate // Minor bug fix here to catch mid-leave correctly
    };
};

export const computeLeaveBalancesRPC = (host: any, rpcData: any[], targetDateStr: string, publicHolidays: any[], anniversaryLeaves: any[]) => {
    if (!host || !rpcData) return null;
    const targetDate = parseISO(targetDateStr);
    const targetYear = targetDate.getFullYear();
    const SYSTEM_START_DATE = new Date(2026, 0, 1); 
    
    const baseCfOff = host.cf_off || 0;
    const baseCfAL = host.cf_al || 0;
    const baseCfPH = host.cf_ph || 0;

    const joinDate = host.joining_date ? parseISO(host.joining_date) : SYSTEM_START_DATE;
    const isExec = ['DA', 'DB'].includes(host.host_level);
    const isIntern = (host.role || '').toLowerCase().includes('intern');

    const hostStats = rpcData.filter((r: any) => String(r.host_id).trim() === String(host.host_id).trim());

    const getStat = (year: number, codes: string[]) => {
        return hostStats.filter((r: any) => r.att_year === year && codes.includes(r.status_code)).reduce((sum: number, r: any) => sum + Number(r.total), 0);
    };

    let cfOff = baseCfOff; let cfAL = baseCfAL; let cfPH = baseCfPH;
    
    if (targetYear > 2026) {
        const accrualStart = isAfter(joinDate, SYSTEM_START_DATE) ? joinDate : SYSTEM_START_DATE;
        const endOfPrevYear = new Date(targetYear - 1, 11, 31);
        if (isBefore(accrualStart, endOfPrevYear) || accrualStart.getTime() === endOfPrevYear.getTime()) {
            const daysBefore = differenceInDays(endOfPrevYear, accrualStart) + 1;
            const penaltyBefore = getStat(targetYear - 1, ['NP', 'A']);
            const eligibleBefore = Math.max(0, daysBefore - penaltyBefore);
            
            cfOff += (eligibleBefore / 7) - getStat(targetYear - 1, ['O', 'OFF']);
            cfAL += (eligibleBefore / 12) - getStat(targetYear - 1, ['AL', 'VAC']);
            cfPH -= getStat(targetYear - 1, ['PH']);
        }
    } else if (targetYear < 2026) {
        cfOff = 0; cfAL = 0; cfPH = 0;
    }

    const startOfTargetYear = new Date(targetYear, 0, 1);
    const trackingStartThisYear = isAfter(joinDate, startOfTargetYear) ? joinDate : startOfTargetYear;
    
    let earnedOff = 0; let earnedAL = 0; let earnedPH = 0;
    
    if (targetDate >= trackingStartThisYear) {
        const daysActive = differenceInDays(targetDate, trackingStartThisYear) + 1;
        const penaltyDays = getStat(targetYear, ['NP', 'A']);
        const eligibleDays = Math.max(0, daysActive - penaltyDays);
        
        earnedOff = eligibleDays / 7;
        earnedAL = eligibleDays / 12;
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
    if (isAfter(lastAnniversary, targetDate)) {
        lastAnniversary.setFullYear(targetYear - 1);
    }
    
    const myAnniversaryLeaves = anniversaryLeaves.filter((a: any) => String(a.host_id).trim() === String(host.host_id).trim() && parseISO(a.date) >= lastAnniversary && parseISO(a.date) <= targetDate);
    const takenSL = myAnniversaryLeaves.filter((a: any) => String(a.status_code).toUpperCase().trim() === 'SL').length;
    const takenEL = myAnniversaryLeaves.filter((a: any) => String(a.status_code).toUpperCase().trim() === 'EL').length;
    const takenRR = myAnniversaryLeaves.filter((a: any) => String(a.status_code).toUpperCase().trim() === 'RR').length;

    const balOffVal = cfOff + earnedOff - takenOff;
    const balALVal = isIntern ? 0 : (cfAL + earnedAL - takenAL);
    const balPHVal = baseCfPH + earnedPH - takenPH;
    const balRRVal = isExec ? 7 - takenRR : 0;
    const totalBal = balOffVal + balALVal + balPHVal + balRRVal;

    return {
        balOff: balOffVal.toFixed(1),
        balAL: isIntern ? '0.0' : balALVal.toFixed(1),
        balPH: balPHVal.toFixed(1),
        balRR: isExec ? balRRVal.toString() : '-',
        balTotal: totalBal.toFixed(1),
        balSL: 30 - takenSL,
        balEL: 10 - takenEL
    };
};