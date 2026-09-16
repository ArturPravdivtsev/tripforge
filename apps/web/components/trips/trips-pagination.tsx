import Link from "next/link";

type TripsPaginationProps = Readonly<{
  page: number;
  totalPages: number;
}>;

const linkClasses =
  "inline-flex min-h-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold shadow-sm transition hover:bg-[var(--surface-muted)]";
const disabledClasses =
  "inline-flex min-h-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface-muted)] px-4 py-2 text-sm font-semibold text-[var(--muted-foreground)] opacity-60";

export function TripsPagination({ page, totalPages }: TripsPaginationProps) {
  if (totalPages === 0) {
    return null;
  }

  return (
    <nav
      aria-label="Trips pagination"
      className="flex flex-wrap items-center justify-center gap-3"
    >
      {page > 1 ? (
        <Link className={linkClasses} href={`/trips?page=${page - 1}`}>
          Previous
        </Link>
      ) : (
        <span aria-disabled="true" className={disabledClasses}>
          Previous
        </span>
      )}
      <span className="text-sm font-medium">
        Page {page} of {totalPages}
      </span>
      {page < totalPages ? (
        <Link className={linkClasses} href={`/trips?page=${page + 1}`}>
          Next
        </Link>
      ) : (
        <span aria-disabled="true" className={disabledClasses}>
          Next
        </span>
      )}
    </nav>
  );
}
