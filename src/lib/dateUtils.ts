import { format } from 'date-fns';

// 1. Always returns the exact current time in Dhaka/Maldives timezone
export const getDhakaTime = () => {
    try {
        return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Dhaka" }));
    } catch(e) {
        return new Date(); // Fallback just in case
    }
};

// 2. Returns today's date string (YYYY-MM-DD) strictly in Dhaka time
export const getDhakaDateStr = (date: Date = getDhakaTime()) => {
    return format(date, 'yyyy-MM-dd');
};

// 3. Formats any date into a beautiful 12-hour string (e.g. "02:30 PM")
export const formatDisplayTime = (dateInput: string | Date) => {
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    return d.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Dhaka',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
};