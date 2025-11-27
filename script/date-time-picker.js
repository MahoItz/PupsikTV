const pickerTheme = (() => {
    const styles = getComputedStyle(document.documentElement);
    return {
        secondary: styles.getPropertyValue('--secondary-color').trim() || '#00d4ff',
        surface: styles.getPropertyValue('--modal-bg').trim() || '#0f0f23',
        text: styles.getPropertyValue('--text-primary').trim() || '#ffffff',
    };
})();

document.addEventListener('DOMContentLoaded', () => {
    if (typeof flatpickr !== 'function') {
        return;
    }

    const dateInput = document.getElementById('planDateInput');
    if (dateInput) {
        flatpickr(dateInput, {
            dateFormat: 'Y-m-d',
            allowInput: true,
            disableMobile: true,
            nextArrow: '\u203A',
            prevArrow: '\u2039',
        });
    }

    const timeInput = document.getElementById('planTimeInput');
    if (timeInput) {
        flatpickr(timeInput, {
            enableTime: true,
            noCalendar: true,
            dateFormat: 'H:i',
            time_24hr: true,
            minuteIncrement: 5,
            allowInput: true,
            disableMobile: true,
        });
    }

    const calendarRoot = document.documentElement;
    calendarRoot.style.setProperty('--flatpickr-primary', pickerTheme.secondary);
    calendarRoot.style.setProperty('--flatpickr-text', pickerTheme.text);
    calendarRoot.style.setProperty('--flatpickr-surface', pickerTheme.surface);
});
