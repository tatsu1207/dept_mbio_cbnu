/* ==========================================================================
   Site configuration — edit this file, not the application code.
   ========================================================================== */

window.DEPT_CONFIG = {

  /* ---- Reservation backend --------------------------------------------
     Paste the Google Apps Script Web App URL here after deploying
     apps-script/Code.gs (see README, step 3). It looks like:
       https://script.google.com/macros/s/AKfy..../exec
     While this is empty the booking page runs in DEMO MODE: bookings are
     kept only in your own browser so you can try the interface. -------- */
  endpoint: 'https://script.google.com/macros/s/AKfycbwSM7PKj3DuYB4bAivcx2bc7fox9dJdTF93cIiH3Mz_y8n02FAOJrDQ9v6CHDDpyYPV/exec',

  /* ---- The room being booked ------------------------------------------ */
  room: {
    name:     { ko: '미생물학과 세미나실', en: 'Microbiology Seminar Room' },
    location: { ko: 'S1-5 208호', en: 'S1-5, Room 208' },
    capacity: 30,
  },

  /* ---- Booking rules --------------------------------------------------- */
  openHour: 8,          // earliest bookable time (24h)
  closeHour: 22,        // latest end time (24h)
  slotMinutes: 30,      // granularity of the start/end time menus
  maxHours: 6,          // longest single booking
  maxDaysAhead: 90,     // how far into the future bookings are accepted
  allowWeekends: true,
};
