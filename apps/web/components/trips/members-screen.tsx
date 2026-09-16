"use client";

import Link from "next/link";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AddTripMemberRequest,
  TripMemberRole,
  TripParticipant,
} from "@tripforge/contracts";
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@tripforge/ui";
import { useForm } from "react-hook-form";

import { ApiClientError } from "@/lib/api/errors";
import { tripsApi } from "@/lib/api/trips";
import { tripKeys } from "@/lib/trips/query-keys";
import {
  memberFormSchema,
  type MemberFormValues,
} from "@/lib/trips/schemas";

type MembersScreenProps = Readonly<{ tripId: string }>;

function memberErrorMessage(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.code === "INVITEE_NOT_FOUND") {
      return "No TripForge account was found for that email.";
    }
    if (error.code === "TRIP_MEMBER_ALREADY_EXISTS") {
      return "That person is already a member of this trip.";
    }
    if (error.code === "TRIP_OWNER_CANNOT_BE_MEMBER") {
      return "The trip owner cannot also be added as a member.";
    }
  }

  return "Unable to update trip members. Please try again.";
}

export function MembersScreen({ tripId }: MembersScreenProps) {
  const queryClient = useQueryClient();
  const [mutationError, setMutationError] = useState<string>();
  const [confirmingUserId, setConfirmingUserId] = useState<string>();
  const tripQuery = useQuery({
    queryFn: ({ signal }) => tripsApi.get(tripId, { signal }),
    queryKey: tripKeys.detail(tripId),
  });
  const membersQuery = useQuery({
    queryFn: ({ signal }) => tripsApi.listMembers(tripId, { signal }),
    queryKey: tripKeys.members(tripId),
  });
  const refreshMembers = () =>
    queryClient.invalidateQueries({
      exact: true,
      queryKey: tripKeys.members(tripId),
    });
  const addMember = useMutation({
    mutationFn: (input: AddTripMemberRequest) => tripsApi.addMember(tripId, input),
    onSuccess: refreshMembers,
  });
  const updateMember = useMutation({
    mutationFn: ({ role, userId }: { role: TripMemberRole; userId: string }) =>
      tripsApi.updateMemberRole(tripId, userId, { role }),
    onSuccess: refreshMembers,
  });
  const removeMember = useMutation({
    mutationFn: (userId: string) => tripsApi.removeMember(tripId, userId),
    onSuccess: async () => {
      setConfirmingUserId(undefined);
      await refreshMembers();
    },
  });

  if (tripQuery.isPending || membersQuery.isPending) {
    return <MembersSkeleton />;
  }

  const error = tripQuery.error ?? membersQuery.error;

  if (error instanceof ApiClientError && error.status === 401) {
    return (
      <StateCard title="Sign in to view trip members.">
        <Link className={textLinkClasses} href="/login">Sign in</Link>
      </StateCard>
    );
  }

  if (error instanceof ApiClientError && error.status === 403) {
    return (
      <StateCard title="You do not have permission to view these members.">
        <Link className={textLinkClasses} href="/trips">Back to trips</Link>
      </StateCard>
    );
  }

  if (error instanceof ApiClientError && error.status === 404) {
    return (
      <StateCard title="Trip not found">
        <Link className={textLinkClasses} href="/trips">Back to trips</Link>
      </StateCard>
    );
  }

  if (tripQuery.isError || membersQuery.isError) {
    return (
      <StateCard title="Unable to load trip members.">
        <Button
          variant="secondary"
          onClick={() => {
            void tripQuery.refetch();
            void membersQuery.refetch();
          }}
        >
          Try again
        </Button>
      </StateCard>
    );
  }

  const isOwner = tripQuery.data.accessRole === "owner";

  async function handleRoleChange(userId: string, role: TripMemberRole) {
    setMutationError(undefined);
    try {
      await updateMember.mutateAsync({ role, userId });
    } catch (mutationFailure) {
      setMutationError(memberErrorMessage(mutationFailure));
    }
  }

  async function handleRemove(userId: string) {
    setMutationError(undefined);
    try {
      await removeMember.mutateAsync(userId);
    } catch (mutationFailure) {
      setMutationError(memberErrorMessage(mutationFailure));
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            Trip members
          </p>
          <h1 className="break-words text-3xl font-bold">{tripQuery.data.name}</h1>
        </div>
        <Link className={textLinkClasses} href="/trips">Back to trips</Link>
      </div>

      {mutationError ? <Alert role="alert">{mutationError}</Alert> : null}

      {isOwner ? (
        <AddMemberCard
          isPending={addMember.isPending}
          onAdd={async (input) => {
            setMutationError(undefined);
            try {
              await addMember.mutateAsync(input);
              return true;
            } catch (mutationFailure) {
              setMutationError(memberErrorMessage(mutationFailure));
              return false;
            }
          }}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>People with access</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-[var(--border)]">
            {membersQuery.data.map((participant) => (
              <ParticipantRow
                confirming={confirmingUserId === participant.user.id}
                isOwner={isOwner}
                isPending={
                  (updateMember.isPending &&
                    updateMember.variables?.userId === participant.user.id) ||
                  (removeMember.isPending &&
                    removeMember.variables === participant.user.id)
                }
                key={participant.user.id}
                onCancelRemove={() => setConfirmingUserId(undefined)}
                onConfirmRemove={() => void handleRemove(participant.user.id)}
                onRemove={() => setConfirmingUserId(participant.user.id)}
                onRoleChange={(role) =>
                  void handleRoleChange(participant.user.id, role)
                }
                participant={participant}
              />
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function AddMemberCard({
  isPending,
  onAdd,
}: Readonly<{
  isPending: boolean;
  onAdd: (input: AddTripMemberRequest) => Promise<boolean>;
}>) {
  const {
    formState: { errors },
    handleSubmit,
    register,
    reset,
  } = useForm<MemberFormValues>({
    defaultValues: { email: "", role: "viewer" },
    resolver: zodResolver(memberFormSchema),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add member</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem_auto] sm:items-end"
          noValidate
          onSubmit={handleSubmit(async (values) => {
            const input = memberFormSchema.parse(values);
            if (await onAdd(input)) reset();
          })}
        >
          <div className="min-w-0 space-y-2">
            <Label htmlFor="member-email">Account email</Label>
            <Input
              id="member-email"
              type="email"
              autoComplete="email"
              aria-invalid={Boolean(errors.email)}
              disabled={isPending}
              {...register("email")}
            />
            {errors.email ? (
              <p className="text-sm text-[var(--danger)]">{errors.email.message}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="member-role">Role</Label>
            <select
              id="member-role"
              className={selectClasses}
              disabled={isPending}
              {...register("role")}
            >
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
            </select>
          </div>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Adding…" : "Add member"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ParticipantRow({
  confirming,
  isOwner,
  isPending,
  onCancelRemove,
  onConfirmRemove,
  onRemove,
  onRoleChange,
  participant,
}: Readonly<{
  confirming: boolean;
  isOwner: boolean;
  isPending: boolean;
  onCancelRemove: () => void;
  onConfirmRemove: () => void;
  onRemove: () => void;
  onRoleChange: (role: TripMemberRole) => void;
  participant: TripParticipant;
}>) {
  const label = participant.user.displayName ?? participant.user.email;

  return (
    <li className="flex min-w-0 flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="break-words font-semibold">{label}</p>
        {participant.user.displayName ? (
          <p className="break-all text-sm text-[var(--muted-foreground)]">
            {participant.user.email}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {isOwner && participant.role !== "owner" ? (
          <>
            <Label className="sr-only" htmlFor={`role-${participant.user.id}`}>
              Role for {label}
            </Label>
            <select
              id={`role-${participant.user.id}`}
              className={`${selectClasses} min-h-9 w-auto py-1.5 text-sm capitalize`}
              disabled={isPending}
              onChange={(event) =>
                onRoleChange(event.target.value as TripMemberRole)
              }
              value={participant.role}
            >
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
            </select>
            {confirming ? (
              <>
                <span className="text-sm font-medium">Remove?</span>
                <Button size="sm" variant="secondary" disabled={isPending} onClick={onCancelRemove}>
                  Cancel
                </Button>
                <Button size="sm" disabled={isPending} onClick={onConfirmRemove}>
                  {isPending ? "Removing…" : "Confirm remove"}
                </Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" disabled={isPending} onClick={onRemove}>
                Remove
              </Button>
            )}
          </>
        ) : (
          <span className="rounded-full bg-[var(--surface-muted)] px-2.5 py-1 text-xs font-semibold capitalize">
            {participant.role}
          </span>
        )}
      </div>
    </li>
  );
}

function MembersSkeleton() {
  return (
    <div aria-label="Loading trip members" className="mx-auto max-w-3xl space-y-5" role="status">
      <div className="h-20 animate-pulse rounded-[var(--radius-md)] bg-[var(--muted)]" />
      <div className="h-64 animate-pulse rounded-[var(--radius-lg)] bg-[var(--muted)]" />
    </div>
  );
}

function StateCard({
  children,
  title,
}: Readonly<{ children: React.ReactNode; title: string }>) {
  return (
    <Card className="mx-auto max-w-2xl text-center">
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

const textLinkClasses = "font-semibold text-[var(--primary)] hover:underline";
const selectClasses =
  "min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--foreground)] shadow-sm focus-visible:border-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50";
