import { useEffect, useReducer } from "react";

interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

type FetchAction<T> =
  | { type: "success"; data: T }
  | { type: "error"; error: string };

function createReducer<T>() {
  return (state: FetchState<T>, action: FetchAction<T>): FetchState<T> => {
    switch (action.type) {
      case "success":
        return { data: action.data, loading: false, error: null };
      case "error":
        return { data: state.data, loading: false, error: action.error };
    }
  };
}

export function useFetch<T>(
  fetcher: () => Promise<T>,
  deps: unknown[]
): FetchState<T> {
  const [state, dispatch] = useReducer(createReducer<T>(), {
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    fetcher()
      .then((data) => {
        if (!cancelled) dispatch({ type: "success", data });
      })
      .catch((e: unknown) => {
        if (!cancelled)
          dispatch({
            type: "error",
            error: e instanceof Error ? e.message : "Unknown error",
          });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
