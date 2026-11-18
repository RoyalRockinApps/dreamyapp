import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import type { ConceptWorkspace } from '@/lib/types';
import { errorMessage, useStore } from '@/store/useStore';

type Result = { key: string; data?: ConceptWorkspace; error?: string; loading?: boolean };

export function useConceptWorkspace(productionId: string, enabled = true) {
  const load = useStore((s) => s.loadConcept);
  const userId = useStore((s) => s.currentUserId);
  const key = JSON.stringify([productionId, userId]);
  const [result, setResult] = useState<Result>();
  const request = useRef(0);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const id = ++request.current;
    setResult((previous) => ({ key, data: previous?.key === key ? previous.data : undefined, loading: true }));
    try {
      const data = await load(productionId);
      if (request.current === id) setResult({ key, data });
    } catch (error) {
      if (request.current === id) setResult({ key, error: errorMessage(error) });
    }
  }, [enabled, key, load, productionId]);

  useFocusEffect(useCallback(() => {
    void refresh();
    return () => { request.current += 1; };
  }, [refresh]));

  const current = enabled && result?.key === key ? result : undefined;
  return { concept: current?.data, loadError: current?.error, loading: enabled && (!current || !!current.loading), refresh };
}
