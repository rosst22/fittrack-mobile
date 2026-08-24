import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';

/**
 * Runs an async loader, and re-runs it every time the screen regains focus.
 *
 * That focus behaviour is the important part: after you log a meal in a modal
 * and come back, the list underneath must not still be showing stale data. On
 * the web the equivalent happened for free, because navigating re-rendered the
 * server component.
 */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(loader, deps);

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await run());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    }
  }, [run]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return { data, error, refreshing, onRefresh, reload: load };
}
