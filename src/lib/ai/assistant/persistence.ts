import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  assistantConversation,
  assistantMessage,
  assistantQuery,
} from "@/lib/schema";
import type { AssistantStep } from "./tools";
import {
  deriveTitle,
  normalizeCategory,
  trimStepsForStorage,
} from "./catalog-helpers";

/**
 * Persistence for the assistant: conversation history + the query catalog
 * substrate. All writes go through the trusted admin `db` connection (NOT the
 * assistant's read-only role). Ownership-scoped helpers take a userId and only
 * touch that user's rows.
 */

export interface ConversationSummary {
  id: string;
  title: string | null;
  model: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface StoredMessage {
  role: "user" | "assistant";
  content: string;
  steps: AssistantStep[] | null;
  stoppedAtStepLimit: boolean;
}

export async function createConversation(
  userId: string,
  firstQuestion: string,
  model: string,
): Promise<string> {
  const [row] = await db
    .insert(assistantConversation)
    .values({ userId, title: deriveTitle(firstQuestion), model })
    .returning({ id: assistantConversation.id });
  return row.id;
}

export async function listConversations(
  userId: string,
): Promise<ConversationSummary[]> {
  return db
    .select({
      id: assistantConversation.id,
      title: assistantConversation.title,
      model: assistantConversation.model,
      createdAt: assistantConversation.createdAt,
      updatedAt: assistantConversation.updatedAt,
    })
    .from(assistantConversation)
    .where(eq(assistantConversation.userId, userId))
    .orderBy(desc(assistantConversation.updatedAt));
}

// Verify the conversation belongs to this user; returns it or null.
async function ownedConversation(userId: string, conversationId: string) {
  const [row] = await db
    .select()
    .from(assistantConversation)
    .where(
      and(
        eq(assistantConversation.id, conversationId),
        eq(assistantConversation.userId, userId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function loadConversation(
  userId: string,
  conversationId: string,
): Promise<{ summary: ConversationSummary; messages: StoredMessage[] } | null> {
  const convo = await ownedConversation(userId, conversationId);
  if (!convo) return null;

  const rows = await db
    .select()
    .from(assistantMessage)
    .where(eq(assistantMessage.conversationId, conversationId))
    .orderBy(assistantMessage.createdAt);

  return {
    summary: {
      id: convo.id,
      title: convo.title,
      model: convo.model,
      createdAt: convo.createdAt,
      updatedAt: convo.updatedAt,
    },
    messages: rows.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
      steps: (m.stepsJson as AssistantStep[] | null) ?? null,
      stoppedAtStepLimit: m.stoppedAtStepLimit,
    })),
  };
}

async function appendMessage(
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  opts: { steps?: AssistantStep[]; stoppedAtStepLimit?: boolean } = {},
): Promise<string> {
  const [row] = await db
    .insert(assistantMessage)
    .values({
      conversationId,
      role,
      content,
      stepsJson: opts.steps ? trimStepsForStorage(opts.steps) : null,
      stoppedAtStepLimit: opts.stoppedAtStepLimit ?? false,
    })
    .returning({ id: assistantMessage.id });
  return row.id;
}

// Persist the query_database steps as catalog rows (the analytics substrate).
async function logQueries(
  messageId: string,
  userId: string,
  steps: AssistantStep[],
): Promise<void> {
  const queries = steps.filter(
    (s) => s.tool === "query_database" || s.tool === "query_posthog",
  );
  if (queries.length === 0) return;
  await db.insert(assistantQuery).values(
    queries.map((s) => ({
      messageId,
      userId,
      source: s.source ?? "postgres",
      queryText: s.sql ?? String((s.input as { sql?: string })?.sql ?? ""),
      category: normalizeCategory(s.category),
      tablesTouched: s.tablesTouched ?? [],
      rowCount: s.rowCount ?? null,
      durationMs: s.durationMs ?? null,
      error: s.error ?? null,
    })),
  );
}

/**
 * Persist one full turn: the user question, the assistant answer (+ its replay
 * steps), and the catalog query rows. Returns the (possibly new) conversationId.
 */
export async function persistTurn(params: {
  userId: string;
  conversationId: string | null;
  model: string;
  question: string;
  answer: string;
  steps: AssistantStep[];
  stoppedAtStepLimit: boolean;
}): Promise<string> {
  const conversationId =
    params.conversationId ??
    (await createConversation(params.userId, params.question, params.model));

  await appendMessage(conversationId, "user", params.question);
  const assistantMsgId = await appendMessage(conversationId, "assistant", params.answer, {
    steps: params.steps,
    stoppedAtStepLimit: params.stoppedAtStepLimit,
  });
  await logQueries(assistantMsgId, params.userId, params.steps);

  // Bump updatedAt + keep the model current for the history ordering.
  await db
    .update(assistantConversation)
    .set({ updatedAt: new Date(), model: params.model })
    .where(eq(assistantConversation.id, conversationId));

  return conversationId;
}

export async function renameConversation(
  userId: string,
  conversationId: string,
  title: string,
): Promise<boolean> {
  if (!(await ownedConversation(userId, conversationId))) return false;
  await db
    .update(assistantConversation)
    .set({ title: deriveTitle(title), updatedAt: new Date() })
    .where(eq(assistantConversation.id, conversationId));
  return true;
}

export async function deleteConversation(
  userId: string,
  conversationId: string,
): Promise<boolean> {
  if (!(await ownedConversation(userId, conversationId))) return false;
  // Messages + queries cascade via FK onDelete.
  await db
    .delete(assistantConversation)
    .where(eq(assistantConversation.id, conversationId));
  return true;
}
