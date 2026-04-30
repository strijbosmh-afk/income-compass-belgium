import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2, ImageOff } from 'lucide-react';

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  paths: string[]; // storage paths in 'screenshots' bucket
};

export function ScreenshotsDialog({ open, onOpenChange, title, description, paths }: Props) {
  const [urls, setUrls] = useState<{ path: string; url: string | null }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const unique = Array.from(new Set(paths.filter(Boolean)));
    if (unique.length === 0) {
      setUrls([]);
      return;
    }
    setLoading(true);
    Promise.all(
      unique.map(async (path) => {
        const { data } = await supabase.storage.from('screenshots').createSignedUrl(path, 3600);
        return { path, url: data?.signedUrl ?? null };
      })
    ).then((res) => {
      setUrls(res);
      setLoading(false);
    });
  }, [open, paths]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : urls.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
            <ImageOff className="h-8 w-8" />
            <p className="text-sm">Geen originele screenshots gekoppeld aan deze prestaties.</p>
            <p className="text-xs">(Records geüpload vóór deze functie hebben geen koppeling.)</p>
          </div>
        ) : (
          <div className="space-y-4">
            {urls.map(({ path, url }) => (
              <div key={path} className="space-y-2">
                <p className="text-xs text-muted-foreground font-mono truncate">{path.split('/').pop()}</p>
                {url ? (
                  <a href={url} target="_blank" rel="noreferrer" className="block">
                    <img src={url} alt={path} className="w-full rounded-md border border-border/50 hover:border-border transition-colors" />
                  </a>
                ) : (
                  <div className="text-sm text-destructive">Kon screenshot niet laden.</div>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
