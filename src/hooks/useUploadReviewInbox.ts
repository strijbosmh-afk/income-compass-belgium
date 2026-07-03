import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ExtractedRecord } from '@/pages/UploadPage';
import type { IncomeType } from '@/lib/incomeTypes';

export type UploadReviewStatus = 'needs_review' | 'ready' | 'saved' | 'blocked';

export type UploadReviewBatch = {
  id: string;
  status: UploadReviewStatus;
  records: ExtractedRecord[];
  previewUrl: string | null;
  title: string;
  month: number;
  year: number;
  incomeType: IncomeType;
  createdAt: string;
  updatedAt: string;
};

const storageKey = (userId: string) => `medincome.uploadReviewInbox.${userId}`;

export function useUploadReviewInbox(userId?: string) {
  const [items, setItems] = useState<UploadReviewBatch[]>([]);

  useEffect(() => {
    if (!userId) {
      setItems([]);
      return;
    }
    try {
      const raw = localStorage.getItem(storageKey(userId));
      setItems(raw ? JSON.parse(raw) : []);
    } catch {
      setItems([]);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    try {
      localStorage.setItem(storageKey(userId), JSON.stringify(items.slice(0, 30)));
    } catch {
      // Storage can be unavailable in constrained WebView states; the inbox is best-effort.
    }
  }, [items, userId]);

  const addBatch = useCallback((batch: Omit<UploadReviewBatch, 'id' | 'status' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString();
    const item: UploadReviewBatch = {
      ...batch,
      id: crypto.randomUUID(),
      status: 'needs_review',
      createdAt: now,
      updatedAt: now,
    };
    setItems(prev => [item, ...prev].slice(0, 30));
    return item.id;
  }, []);

  const updateStatus = useCallback((id: string, status: UploadReviewStatus) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, status, updatedAt: new Date().toISOString() } : item));
  }, []);

  const removeBatch = useCallback((id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  }, []);

  const clearSaved = useCallback(() => {
    setItems(prev => prev.filter(item => item.status !== 'saved'));
  }, []);

  const counts = useMemo(() => ({
    needsReview: items.filter(item => item.status === 'needs_review').length,
    ready: items.filter(item => item.status === 'ready').length,
    saved: items.filter(item => item.status === 'saved').length,
    blocked: items.filter(item => item.status === 'blocked').length,
  }), [items]);

  return { items, counts, addBatch, updateStatus, removeBatch, clearSaved };
}
