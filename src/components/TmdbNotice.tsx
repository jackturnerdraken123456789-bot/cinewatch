import { Info } from 'lucide-react';

interface TmdbNoticeProps {
  message?: string | null;
}

export function TmdbNotice({ message }: TmdbNoticeProps) {
  return (
    <div className="rounded-xl bg-[#272828] border border-white/10 p-4 flex items-start gap-3">
      <Info className="w-4 h-4 text-[#B7FF4C] shrink-0 mt-0.5" />
      <div className="space-y-1">
        <p className="text-xs font-semibold text-white">
          No-Key Fallback Catalog Active (Apple iTunes & Internet Archive Public Domain)
        </p>
        <p className="text-xs text-[#B4B8B8] leading-relaxed">
          {message
            ? `TMDB returned "${message}", so CineWatch automatically switched to real movies from Apple iTunes (with playable trailers) and free full-length public domain films from Internet Archive. Update TMDB_API_KEY in Secrets anytime to restore TMDB regional streaming links.`
            : 'CineWatch is using live no-key movie feeds (Apple iTunes & Internet Archive public domain films). Add a valid TMDB_API_KEY in Secrets anytime for TMDB cast lists and Netflix/Prime/Disney+ regional availability.'}
        </p>
      </div>
    </div>
  );
}
