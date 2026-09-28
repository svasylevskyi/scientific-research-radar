import { useEffect } from "react";
import type { SetURLSearchParams } from "react-router-dom";
import { updateQuery } from "../navigationContext";

/** A deletion or an old bookmark may leave the requested page beyond the list. */
export function useListPageBounds(page: number, total: number | undefined, pageSize: number, setSearch: SetURLSearchParams) {
  useEffect(() => {
    if (total === undefined) return;
    const lastPage = Math.max(1, Math.ceil(total / pageSize));
    if (page > lastPage) setSearch(current => updateQuery(current, { page: lastPage === 1 ? null : lastPage }),
      { replace: true, preventScrollReset: true });
  }, [page, total, pageSize, setSearch]);
}
