import { Card, CardContent, CardHeader, CardTitle } from "@tripforge/ui";

export function ExpenseScreenState({
  children,
  loading = false,
  title,
}: Readonly<{
  children?: React.ReactNode;
  loading?: boolean;
  title: string;
}>) {
  if (loading) {
    return (
      <div aria-label={title} className="space-y-4" role="status">
        <span className="sr-only">{title}</span>
        <div aria-hidden="true" className="h-24 animate-pulse rounded-[var(--radius-md)] bg-[var(--muted)]" />
        <div aria-hidden="true" className="h-72 animate-pulse rounded-[var(--radius-md)] bg-[var(--muted)]" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader><CardTitle as="h1">{title}</CardTitle></CardHeader>
      {children ? <CardContent>{children}</CardContent> : null}
    </Card>
  );
}
