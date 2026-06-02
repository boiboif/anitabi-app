import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';

dayjs.extend(duration);

export function formatDuration(seconds: number): string {
  const d = dayjs.duration(seconds, 'seconds');

  const minutes = Math.floor(d.asMinutes());
  const secs = d.seconds();

  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
