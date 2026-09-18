import { Inject, Injectable } from "@nestjs/common";
import type {
  ExpenseParticipant,
  TripExpense,
  TripExpenseCategory,
  TripExpenseSplitMethod,
} from "@tripforge/contracts";
import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { DATABASE } from "../database/database.constants";
import type { Database } from "../database/database.provider";
import {
  tripExpenseSplits,
  tripExpenses,
  tripReservations,
  users,
} from "../database/schema";

export type ExpenseShareState = Readonly<{
  userId: string;
  amountMinor: number;
}>;

export type ExpenseState = Readonly<{
  amountMinor: number;
  category: TripExpenseCategory;
  currency: string;
  notes: string | null;
  paidByUserId: string;
  reservationId: string | null;
  shares: readonly ExpenseShareState[];
  spentOn: string;
  splitMethod: TripExpenseSplitMethod;
  title: string;
}>;

const expenseSelection = {
  amountMinor: tripExpenses.amountMinor,
  category: tripExpenses.category,
  createdAt: tripExpenses.createdAt,
  currency: tripExpenses.currency,
  id: tripExpenses.id,
  notes: tripExpenses.notes,
  paidByDisplayName: users.displayName,
  paidByEmail: users.email,
  paidByUserId: tripExpenses.paidByUserId,
  reservationId: tripExpenses.reservationId,
  spentOn: tripExpenses.spentOn,
  splitMethod: tripExpenses.splitMethod,
  title: tripExpenses.title,
  updatedAt: tripExpenses.updatedAt,
};

type ExpenseRow = {
  amountMinor: number;
  category: TripExpenseCategory;
  createdAt: Date;
  currency: string;
  id: string;
  notes: string | null;
  paidByDisplayName: string | null;
  paidByEmail: string;
  paidByUserId: string;
  reservationId: string | null;
  spentOn: string;
  splitMethod: TripExpenseSplitMethod;
  title: string;
  updatedAt: Date;
};

type ShareRow = {
  amountMinor: number;
  displayName: string | null;
  email: string;
  expenseId: string;
  userId: string;
};

@Injectable()
export class TripExpensesRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async list(tripId: string): Promise<TripExpense[]> {
    const rows = await this.database
      .select(expenseSelection)
      .from(tripExpenses)
      .innerJoin(users, eq(users.id, tripExpenses.paidByUserId))
      .where(eq(tripExpenses.tripId, tripId))
      .orderBy(
        desc(tripExpenses.spentOn),
        desc(tripExpenses.createdAt),
        desc(tripExpenses.id),
      );

    return this.hydrate(rows);
  }

  async find(tripId: string, expenseId: string): Promise<TripExpense | undefined> {
    const [row] = await this.database
      .select(expenseSelection)
      .from(tripExpenses)
      .innerJoin(users, eq(users.id, tripExpenses.paidByUserId))
      .where(
        and(eq(tripExpenses.tripId, tripId), eq(tripExpenses.id, expenseId)),
      )
      .limit(1);

    if (!row) return undefined;
    const [expense] = await this.hydrate([row]);
    return expense;
  }

  async reservationBelongsToTrip(
    tripId: string,
    reservationId: string,
  ): Promise<boolean> {
    const [row] = await this.database
      .select({ id: tripReservations.id })
      .from(tripReservations)
      .where(
        and(
          eq(tripReservations.tripId, tripId),
          eq(tripReservations.id, reservationId),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  async create(tripId: string, state: ExpenseState): Promise<TripExpense> {
    const expenseId = await this.database.transaction(async (transaction) => {
      const [row] = await transaction
        .insert(tripExpenses)
        .values({
          amountMinor: state.amountMinor,
          category: state.category,
          currency: state.currency,
          notes: state.notes,
          paidByUserId: state.paidByUserId,
          reservationId: state.reservationId,
          spentOn: state.spentOn,
          splitMethod: state.splitMethod,
          title: state.title,
          tripId,
        })
        .returning({ id: tripExpenses.id });
      if (!row) throw new Error("Expense insert did not return a row");

      await transaction.insert(tripExpenseSplits).values(
        state.shares.map((share) => ({
          amountMinor: share.amountMinor,
          expenseId: row.id,
          userId: share.userId,
        })),
      );
      return row.id;
    });

    const created = await this.find(tripId, expenseId);
    if (!created) throw new Error("Created expense could not be loaded");
    return created;
  }

  async update(
    tripId: string,
    expenseId: string,
    state: ExpenseState,
    replaceShares: boolean,
  ): Promise<TripExpense | undefined> {
    const updated = await this.database.transaction(async (transaction) => {
      const rows = await transaction
        .update(tripExpenses)
        .set({
          amountMinor: state.amountMinor,
          category: state.category,
          currency: state.currency,
          notes: state.notes,
          paidByUserId: state.paidByUserId,
          reservationId: state.reservationId,
          spentOn: state.spentOn,
          splitMethod: state.splitMethod,
          title: state.title,
          updatedAt: new Date(),
        })
        .where(
          and(eq(tripExpenses.tripId, tripId), eq(tripExpenses.id, expenseId)),
        )
        .returning({ id: tripExpenses.id });
      if (rows.length === 0) return false;

      if (replaceShares) {
        await transaction
          .delete(tripExpenseSplits)
          .where(eq(tripExpenseSplits.expenseId, expenseId));
        await transaction.insert(tripExpenseSplits).values(
          state.shares.map((share) => ({
            amountMinor: share.amountMinor,
            expenseId,
            userId: share.userId,
          })),
        );
      }
      return true;
    });

    return updated ? this.find(tripId, expenseId) : undefined;
  }

  async delete(tripId: string, expenseId: string): Promise<boolean> {
    const rows = await this.database
      .delete(tripExpenses)
      .where(
        and(eq(tripExpenses.tripId, tripId), eq(tripExpenses.id, expenseId)),
      )
      .returning({ id: tripExpenses.id });
    return rows.length > 0;
  }

  private async hydrate(rows: ExpenseRow[]): Promise<TripExpense[]> {
    if (rows.length === 0) return [];

    const shares = await this.database
      .select({
        amountMinor: tripExpenseSplits.amountMinor,
        displayName: users.displayName,
        email: users.email,
        expenseId: tripExpenseSplits.expenseId,
        userId: tripExpenseSplits.userId,
      })
      .from(tripExpenseSplits)
      .innerJoin(users, eq(users.id, tripExpenseSplits.userId))
      .where(
        inArray(
          tripExpenseSplits.expenseId,
          rows.map(({ id }) => id),
        ),
      )
      .orderBy(asc(tripExpenseSplits.expenseId), asc(tripExpenseSplits.userId));

    const sharesByExpense = new Map<string, ShareRow[]>();
    for (const share of shares) {
      const existing = sharesByExpense.get(share.expenseId) ?? [];
      existing.push(share);
      sharesByExpense.set(share.expenseId, existing);
    }

    return rows.map((row) => toExpense(row, sharesByExpense.get(row.id) ?? []));
  }
}

function participant(
  userId: string,
  displayName: string | null,
  email: string,
): ExpenseParticipant {
  return { displayName, email, userId };
}

function toExpense(row: ExpenseRow, shares: ShareRow[]): TripExpense {
  return {
    amountMinor: row.amountMinor,
    category: row.category,
    createdAt: row.createdAt.toISOString(),
    currency: row.currency,
    id: row.id,
    notes: row.notes,
    paidBy: participant(
      row.paidByUserId,
      row.paidByDisplayName,
      row.paidByEmail,
    ),
    reservationId: row.reservationId,
    shares: shares.map((share) => ({
      amountMinor: share.amountMinor,
      participant: participant(share.userId, share.displayName, share.email),
    })),
    spentOn: row.spentOn,
    splitMethod: row.splitMethod,
    title: row.title,
    updatedAt: row.updatedAt.toISOString(),
  };
}
