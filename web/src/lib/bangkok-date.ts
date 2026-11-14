// วันครบกำหนดเป็นวันที่ล้วนของกรุงเทพ ไม่ใช่ UTC instant
function civilDay(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const ms = Date.parse(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== value) return null
  return ms / 86_400_000
}

export function formatBangkokDue(due: string, today: string): string {
  const target = civilDay(due)
  const current = civilDay(today)
  if (target === null || current === null) return due
  const diff = target - current
  if (diff < 0) return `เลยกำหนด ${Math.abs(diff)} วัน`
  if (diff === 0) return 'วันนี้'
  return `อีก ${diff} วัน`
}
