/* เวลาอ้างอิงของ MNG ERP — วันและเวลาแสดงผลเป็น Asia/Bangkok เสมอ
   ISO ที่ลงท้าย Z ยังคงเป็น instant แบบ UTC; ไม่แปลงวันที่ล้วนเป็น instant */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BangkokTime = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const timezone = 'Asia/Bangkok';
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, calendar: 'gregory', numberingSystem: 'latn',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  let offsetMs = 0;

  function fromInstant(at) {
    const parts = Object.fromEntries(formatter.formatToParts(at)
      .filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
    const date = `${parts.year}-${parts.month}-${parts.day}`;
    const time = `${parts.hour}:${parts.minute}`;
    return { date, time, second: parts.second, dateTime: `${date} ${time}`, timezone };
  }

  function now() { return new Date(Date.now() + offsetMs); }
  function current() { return fromInstant(now()); }

  // ชดเชยเวลาบนอุปกรณ์เมื่อเชื่อม API โดยใช้ midpoint ของคำขอเวลาแบบสั้น
  // ปฏิเสธ response ที่ไม่มี UTC marker หรือใช้เวลานานเกินไป แทนการปรับนาฬิกาผิด
  function synchronize(serverTime, sentAt, receivedAt) {
    if (typeof serverTime !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(serverTime)) return false;
    const serverMs = Date.parse(serverTime);
    const elapsed = receivedAt - sentAt;
    if (!Number.isFinite(serverMs) || !Number.isFinite(elapsed) || elapsed < 0 || elapsed > 10000) return false;
    offsetMs = serverMs - (sentAt + elapsed / 2);
    return true;
  }

  function reset() { offsetMs = 0; }
  return { timezone, fromInstant, now, current, synchronize, reset };
});
