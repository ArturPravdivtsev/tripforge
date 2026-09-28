"use client";

import Link from "next/link";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryKey,
} from "@tanstack/react-query";
import type {
  NotificationPage,
  UserNotification,
} from "@tripforge/contracts";
import { Alert, Button, Card, CardContent } from "@tripforge/ui";

import { notificationsApi } from "@/lib/api/notifications";
import {
  formatNotificationTime,
  notificationCopy,
  notificationTargetHref,
} from "@/lib/notifications/presentation";
import { notificationKeys } from "@/lib/notifications/query-keys";

type ListSnapshot = [QueryKey, InfiniteData<NotificationPage> | undefined];

type MutationContext = Readonly<{
  count: { unreadCount: number } | undefined;
  lists: ListSnapshot[];
}>;

export function NotificationsScreen() {
  const queryClient = useQueryClient();
  const notifications = useInfiniteQuery({
    queryKey: notificationKeys.list(),
    queryFn: ({ pageParam, signal }) =>
      notificationsApi.list(
        { cursor: pageParam ?? undefined, limit: 20 },
        { signal },
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const unread = useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: ({ signal }) => notificationsApi.unreadCount({ signal }),
  });

  const readMutation = useMutation({
    mutationFn: (input: { id: string; read: boolean }) =>
      notificationsApi.setReadState(input.id, input.read),
    onMutate: async ({ id, read }): Promise<MutationContext> => {
      await cancelNotificationQueries(queryClient);
      const context = snapshotNotificationQueries(queryClient);
      const current = findCachedNotification(context.lists, id);
      queryClient.setQueriesData<InfiniteData<NotificationPage>>(
        { queryKey: notificationKeys.list() },
        (data) => updateReadState(data, id, read ? new Date().toISOString() : null),
      );
      if (current && Boolean(current.readAt) !== read) {
        queryClient.setQueryData(notificationKeys.unreadCount(), {
          unreadCount: Math.max(
            0,
            (context.count?.unreadCount ?? 0) + (read ? -1 : 1),
          ),
        });
      }
      return context;
    },
    onError: (_error, _input, context) => restoreContext(queryClient, context),
    onSettled: () => invalidateNotificationQueries(queryClient),
  });

  const readAllMutation = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onMutate: async (): Promise<MutationContext> => {
      await cancelNotificationQueries(queryClient);
      const context = snapshotNotificationQueries(queryClient);
      const readAt = new Date().toISOString();
      queryClient.setQueriesData<InfiniteData<NotificationPage>>(
        { queryKey: notificationKeys.list() },
        (data) => markCachedPagesRead(data, readAt),
      );
      queryClient.setQueryData(notificationKeys.unreadCount(), { unreadCount: 0 });
      return context;
    },
    onError: (_error, _input, context) => restoreContext(queryClient, context),
    onSettled: () => invalidateNotificationQueries(queryClient),
  });

  if (notifications.isPending) {
    return <p role="status">Loading notifications…</p>;
  }

  if (notifications.isError) {
    return (
      <Alert role="alert">
        Notifications could not be loaded. Please try again.
      </Alert>
    );
  }

  const items = deduplicateNotifications(
    notifications.data.pages.flatMap((page) => page.items),
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted-foreground)]">
          Important collaboration updates are kept here.
        </p>
        {(unread.data?.unreadCount ?? 0) > 0 ? (
          <Button
            variant="secondary"
            disabled={readAllMutation.isPending}
            onClick={() => readAllMutation.mutate()}
          >
            {readAllMutation.isPending ? "Marking…" : "Mark all as read"}
          </Button>
        ) : null}
      </div>

      {readMutation.isError || readAllMutation.isError ? (
        <Alert role="alert">Read state could not be saved. Your previous state was restored.</Alert>
      ) : null}

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-[var(--muted-foreground)]">
            No notifications yet.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {items.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              isUpdating={
                readMutation.isPending &&
                readMutation.variables.id === notification.id
              }
              onReadChange={(read) =>
                readMutation.mutate({ id: notification.id, read })
              }
            />
          ))}
        </ul>
      )}

      {notifications.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            disabled={notifications.isFetchingNextPage}
            onClick={() => void notifications.fetchNextPage()}
          >
            {notifications.isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function NotificationItem({
  isUpdating,
  notification,
  onReadChange,
}: Readonly<{
  isUpdating: boolean;
  notification: UserNotification;
  onReadChange: (read: boolean) => void;
}>) {
  const href = notificationTargetHref(notification.target);
  const unread = notification.readAt === null;

  return (
    <li>
      <Card className={unread ? "border-[var(--primary)]" : undefined}>
        <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex items-start gap-2">
              {unread ? (
                <span className="mt-2 size-2 shrink-0 rounded-full bg-[var(--primary)]" />
              ) : null}
              <p className={unread ? "font-semibold" : "font-medium"}>
                {notificationCopy(notification)}
              </p>
            </div>
            <p className="text-xs text-[var(--muted-foreground)]">
              {unread ? "Unread · " : ""}
              {formatNotificationTime(notification.createdAt)}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {href ? (
              <Link
                href={href}
                className="inline-flex min-h-9 items-center rounded-[var(--radius-md)] bg-[var(--primary)] px-3 text-sm font-semibold text-[var(--primary-foreground)]"
                onClick={() => {
                  if (unread) onReadChange(true);
                }}
              >
                Open
              </Link>
            ) : null}
            <Button
              size="sm"
              variant="secondary"
              disabled={isUpdating}
              onClick={() => onReadChange(unread)}
            >
              {unread ? "Mark as read" : "Mark as unread"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </li>
  );
}

function deduplicateNotifications(
  notifications: readonly UserNotification[],
): UserNotification[] {
  return [...new Map(notifications.map((item) => [item.id, item])).values()];
}

function updateReadState(
  data: InfiniteData<NotificationPage> | undefined,
  id: string,
  readAt: string | null,
): InfiniteData<NotificationPage> | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((item) =>
        item.id === id ? { ...item, readAt } : item,
      ),
    })),
  };
}

function markCachedPagesRead(
  data: InfiniteData<NotificationPage> | undefined,
  readAt: string,
): InfiniteData<NotificationPage> | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((item) =>
        item.readAt ? item : { ...item, readAt },
      ),
    })),
  };
}

async function cancelNotificationQueries(
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<void> {
  await queryClient.cancelQueries({ queryKey: notificationKeys.all });
}

function snapshotNotificationQueries(
  queryClient: ReturnType<typeof useQueryClient>,
): MutationContext {
  return {
    count: queryClient.getQueryData(notificationKeys.unreadCount()),
    lists: queryClient.getQueriesData<InfiniteData<NotificationPage>>({
      queryKey: notificationKeys.list(),
    }),
  };
}

function restoreContext(
  queryClient: ReturnType<typeof useQueryClient>,
  context: MutationContext | undefined,
): void {
  if (!context) return;
  for (const [key, data] of context.lists) queryClient.setQueryData(key, data);
  queryClient.setQueryData(notificationKeys.unreadCount(), context.count);
}

function findCachedNotification(
  snapshots: ListSnapshot[],
  id: string,
): UserNotification | undefined {
  for (const [, data] of snapshots) {
    for (const page of data?.pages ?? []) {
      const notification = page.items.find((item) => item.id === id);
      if (notification) return notification;
    }
  }
  return undefined;
}

function invalidateNotificationQueries(
  queryClient: ReturnType<typeof useQueryClient>,
): void {
  void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
}
