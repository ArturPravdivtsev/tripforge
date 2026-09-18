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
        <div className="h-24 animate-pulse rounded-[var(--radius-md)] bg-[var(--muted)]" />
        <div className="h-72 animate-pulse rounded-[var(--radius-md)] bg-[var(--muted)]" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      {children ? <CardContent>{children}</CardContent> : null}
    </Card>
  );
}
