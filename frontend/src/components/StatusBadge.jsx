const STYLES = {
  COMPLETED: ['Completed', 'bg-ok-bg text-ok'],
  NO_DATA: ['No data', 'bg-bad-bg text-bad'],
  PENDING: ['In progress', 'bg-tint text-primary'],
  FAILED: ['Failed', 'bg-bad-bg text-bad'],
  ACTIVE: ['Active', 'bg-ok-bg text-ok'],
  INACTIVE: ['Inactive', 'bg-quiet-bg text-quiet'],
  OLDER: ['Older data', 'bg-warn-bg text-warn'],
  CURATED: ['Curated', 'bg-tint text-primary'],
  UNLISTED: ['Unlisted source', 'bg-warn-bg text-warn'],
  LISTING: ['From listing', 'bg-tint text-primary'],
};
export default function StatusBadge({ status }) {
  const [label, cls] = STYLES[status] || [status, 'bg-quiet-bg text-quiet'];
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${cls}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{label}</span>;
}
